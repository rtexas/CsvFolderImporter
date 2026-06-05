<#
.SYNOPSIS
    Post-install configuration for CsvFolderImporter.
    Reads setup_config.ini, updates appsettings.json, creates the SQL database
    and tables, seeds Settings rows, and creates the root import folder.
    Runs elevated as LocalSystem via the MSI custom action.
    Can also be run manually as Administrator after installation.
#>
param()

$ErrorActionPreference = 'Continue'
$scriptDir = if ($PSScriptRoot) { $PSScriptRoot } else { Split-Path -Parent $MyInvocation.MyCommand.Path }

# Write to a plain-text log in the install folder so failures are readable even
# after MSI rollback removes the install. The log survives rollback because it is
# not a managed MSI component.
$setupLog = Join-Path $scriptDir 'setup_log.txt'
"" | Set-Content $setupLog -Encoding UTF8   # truncate on each run

function Write-Log([string]$Message, [string]$Level = 'INFO') {
    $ts   = Get-Date -Format 'yyyy-MM-dd HH:mm:ss'
    $line = "[$ts] [$Level] $Message"
    Write-Host $line
    Add-Content $setupLog $line -Encoding UTF8
}

# ── Read setup_config.ini ─────────────────────────────────────────────────────
$iniPath = Join-Path $scriptDir 'setup_config.ini'
if (-not (Test-Path $iniPath)) {
    Write-Log "setup_config.ini not found at: $iniPath" 'WARN'
    Write-Log "Please update appsettings.json and [dbo].[Settings] manually." 'WARN'
    exit 0
}

$config = @{}
foreach ($line in (Get-Content $iniPath)) {
    # Split only on the FIRST '=' so connection strings (which contain '=') parse correctly.
    if ($line -match '^\s*([^=\[;#\s][^=]*?)\s*=(.*)$') {
        $config[$matches[1].Trim()] = $matches[2].Trim()
    }
}

$connectionString    = $config['ConnectionString']
$rootFolderPath      = $config['RootFolderPath']
$pollIntervalMinutes = if ($config['PollIntervalMinutes']) { $config['PollIntervalMinutes'] } else { '5' }

if (-not $connectionString) {
    Write-Log 'ConnectionString not found in setup_config.ini - skipping SQL configuration.' 'WARN'
    exit 0
}
if (-not $rootFolderPath) {
    Write-Log 'RootFolderPath not found - defaulting to C:\ImportData.' 'WARN'
    $rootFolderPath = 'C:\ImportData'
}

$preview = $connectionString.Substring(0, [Math]::Min(60, $connectionString.Length))
Write-Log "Connection: $preview..."
Write-Log "Root Folder: $rootFolderPath"
Write-Log "Poll Interval: $pollIntervalMinutes minutes"

# ── Update appsettings.json ───────────────────────────────────────────────────
$appsettingsPath = Join-Path $scriptDir 'appsettings.json'
try {
    $json = @{ ConnectionStrings = @{ CsvFolderImporter = $connectionString } } |
            ConvertTo-Json -Depth 5
    Set-Content -Path $appsettingsPath -Value $json -Encoding UTF8
    Write-Log 'Updated appsettings.json.'
}
catch {
    Write-Log "Failed to write appsettings.json: $_" 'ERROR'
    exit 1
}

# ── Load System.Data.SqlClient from the .NET Framework GAC ───────────────────
# The MSI custom action runs WindowsPowerShell (5.1 / .NET Framework).
# System.Data is part of .NET Framework — no external DLL needed.
Add-Type -AssemblyName 'System.Data'

# Executes a list of SQL batches over a single persistent connection.
# Opening one connection per database avoids repeated TLS handshakes to the server.
function Invoke-SqlBatches {
    param(
        [string]  $ConnStr,
        [string[]]$Batches,
        [int]     $TimeoutSeconds = 60
    )
    $conn = [System.Data.SqlClient.SqlConnection]::new($ConnStr)
    $conn.Open()
    try {
        foreach ($b in $Batches) {
            $cmd = $conn.CreateCommand()
            $cmd.CommandTimeout = $TimeoutSeconds
            $cmd.CommandText    = $b
            $cmd.ExecuteNonQuery() | Out-Null
        }
    }
    finally { $conn.Close() }
}


# Extract the target database name from the connection string.
$dbName = $null
foreach ($part in ($connectionString -split ';')) {
    if ($part -match '^\s*(Database|Initial Catalog)\s*=\s*(.+)\s*$') {
        $dbName = $matches[2].Trim(); break
    }
}
if (-not $dbName) {
    Write-Log 'Could not determine database name from connection string.' 'ERROR'
    exit 1
}
Write-Log "Target database: $dbName"

# Build a master-db connection string for CREATE DATABASE (same server, db=master).
$masterCs = ($connectionString -replace '(?i)(Database|Initial Catalog)\s*=[^;]+', 'Database=master').TrimEnd(';')
if ($masterCs -notmatch '(?i)(Database|Initial Catalog)\s*=') {
    $masterCs += ';Database=master'
}

# ── Run the DDL script (creates DB, tables, seeds settings) ───────────────────
# The SQL script hardcodes 'CsvFolderImporter' as the DB name; replace it with
# the actual database name from the connection string before executing.
$sqlScriptPath = Join-Path $scriptDir 'SQL\CsvFolderImporter.sql'
if (Test-Path $sqlScriptPath) {
    Write-Log 'Running CsvFolderImporter.sql...'
    try {
        $sqlContent = (Get-Content $sqlScriptPath -Raw) -replace 'CsvFolderImporter', $dbName
        $allBatches = $sqlContent -split '(?im)^\s*GO\s*$'

        # Separate batches into two buckets by tracking USE statements.
        # System.Data.SqlClient ignores USE — switching databases requires a new connection.
        # We collect all batches for each context then open ONE connection per context.
        $masterBatches = @()
        $targetBatches = @()
        $inTarget = $false   # start in master context for CREATE DATABASE

        foreach ($batch in $allBatches) {
            $b = $batch.Trim()
            if ($b -eq '') { continue }

            # Pure USE statement — flip context flag and skip (SqlClient ignores USE anyway).
            if ($b -match '(?i)^\s*USE\s+\[?(\w+)\]?\s*;?\s*$') {
                $inTarget = ($matches[1] -ine 'master')
                continue
            }

            if ($inTarget) { $targetBatches += $b } else { $masterBatches += $b }
        }

        Write-Log "Executing $($masterBatches.Count) batch(es) against [master]..."
        if ($masterBatches.Count -gt 0) {
            Invoke-SqlBatches -ConnStr $masterCs -Batches $masterBatches
            # Give SQL Server a moment to bring the newly-created database fully online
            # before opening a second connection targeting it.
            Start-Sleep -Seconds 5
        }

        Write-Log "Executing $($targetBatches.Count) batch(es) against [$dbName]..."
        if ($targetBatches.Count -gt 0) {
            Invoke-SqlBatches -ConnStr $connectionString -Batches $targetBatches
        }

        Write-Log "SQL DDL script completed."
    }
    catch {
        Write-Log "SQL DDL script failed: $_" 'ERROR'
        exit 1
    }
}
else {
    Write-Log "SQL script not found at: $sqlScriptPath" 'ERROR'
    exit 1
}

# ── Upsert installer-collected values into [dbo].[Settings] ───────────────────
Write-Log 'Updating [dbo].[Settings]...'

$escapedRoot = $rootFolderPath.Replace("'", "''")
$settingsSql = @"
IF EXISTS (SELECT 1 FROM [dbo].[Settings] WHERE [Name] = 'RootFolderPath')
    UPDATE [dbo].[Settings] SET [Value] = '$escapedRoot', [IsEnabled] = 1 WHERE [Name] = 'RootFolderPath';
ELSE
    INSERT INTO [dbo].[Settings] ([Name],[Value],[IsEnabled]) VALUES ('RootFolderPath','$escapedRoot',1);

IF EXISTS (SELECT 1 FROM [dbo].[Settings] WHERE [Name] = 'PollIntervalMinutes')
    UPDATE [dbo].[Settings] SET [Value] = '$pollIntervalMinutes', [IsEnabled] = 1 WHERE [Name] = 'PollIntervalMinutes';
ELSE
    INSERT INTO [dbo].[Settings] ([Name],[Value],[IsEnabled]) VALUES ('PollIntervalMinutes','$pollIntervalMinutes',1);
"@

try {
    Invoke-SqlBatches -ConnStr $connectionString -Batches @($settingsSql)
    Write-Log 'Settings table updated.'
}
catch {
    Write-Log "Failed to update Settings table: $_" 'WARN'
}

# ── Create root import folder ─────────────────────────────────────────────────
if (-not (Test-Path $rootFolderPath)) {
    try {
        New-Item -ItemType Directory -Path $rootFolderPath -Force | Out-Null
        Write-Log "Created root folder: $rootFolderPath"
    }
    catch {
        Write-Log "Could not create '$rootFolderPath': $_" 'WARN'
    }
}

# ── Register and start the Windows service ────────────────────────────────────
# MSI no longer handles ServiceInstall (that requires the KeyPath to be the .exe).
# We register the service here using New-Service so the binary path is always correct.
$exePath = Join-Path $scriptDir 'CsvFolderImporter.exe'
Write-Log "Registering service: $exePath"

$existingSvc = Get-Service -Name 'CsvFolderImporter' -ErrorAction SilentlyContinue
if ($existingSvc) {
    Write-Log 'Service already registered - stopping before update...'
    Stop-Service -Name 'CsvFolderImporter' -Force -ErrorAction SilentlyContinue
    Start-Sleep -Seconds 2
    & sc.exe delete CsvFolderImporter | Out-Null
    Start-Sleep -Seconds 1
}

try {
    New-Service -Name 'CsvFolderImporter' `
                -BinaryPathName "`"$exePath`"" `
                -DisplayName 'CSV Folder Importer' `
                -Description 'Monitors folders and imports CSV/Excel files into SQL Server tables.' `
                -StartupType Automatic `
                -ErrorAction Stop
    Write-Log 'Service registered.'
}
catch {
    Write-Log "Failed to register service: $_" 'ERROR'
    Write-Log "Register manually: New-Service -Name CsvFolderImporter -BinaryPathName '$exePath' -StartupType Automatic" 'WARN'
}

Write-Log 'Starting CsvFolderImporter service...'
try {
    Start-Service -Name 'CsvFolderImporter' -ErrorAction Stop
    Write-Log 'Service started.'
}
catch {
    Write-Log "Failed to start service: $_" 'WARN'
    Write-Log 'Start manually: Start-Service CsvFolderImporter' 'WARN'
}

# ── Configure service failure recovery (restart on 1st and 2nd failure) ───────
Write-Log 'Configuring service failure recovery...'
try {
    # reset= 86400  : reset failure count after 1 day
    # actions=      : restart after 60s on 1st failure, restart after 60s on 2nd, nothing on 3rd
    & sc.exe failure CsvFolderImporter reset= 86400 actions= restart/60000/restart/60000//0 | Out-Null
    Write-Log 'Service failure recovery configured.'
}
catch {
    Write-Log "Could not configure service failure recovery: $_" 'WARN'
}

Write-Log ''
Write-Log '================================================='
Write-Log 'Configuration complete.'
Write-Log "  Install dir   : $scriptDir"
Write-Log "  Root folder   : $rootFolderPath"
Write-Log "  Poll interval : $pollIntervalMinutes minutes"
Write-Log '  Service       : CsvFolderImporter (started by installer)'
Write-Log '================================================='
