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

function Write-Log([string]$Message, [string]$Level = 'INFO') {
    $ts = Get-Date -Format 'yyyy-MM-dd HH:mm:ss'
    Write-Host "[$ts] [$Level] $Message"
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

# ── Parse connection string into sqlcmd arguments ─────────────────────────────
$csParts = @{}
foreach ($part in ($connectionString -split ';')) {
    if ($part -match '^\s*([^=]+?)\s*=\s*(.*?)\s*$') {
        $csParts[$matches[1].Trim().ToLower()] = $matches[2].Trim()
    }
}

function Get-CsValue([string[]]$keys) {
    foreach ($k in $keys) { if ($csParts[$k]) { return $csParts[$k] } }
    return $null
}

$server    = Get-CsValue 'server','data source','addr','address','network address'
$trusted   = (Get-CsValue 'trusted_connection','integrated security') -in @('true','yes','sspi')
$userId    = Get-CsValue 'user id','uid','user'
$password  = Get-CsValue 'password','pwd'
$trustCert = (Get-CsValue 'trustservercertificate') -eq 'true'

if (-not $server) {
    Write-Log 'Could not parse server name from connection string.' 'WARN'
    $server = '.'
}

# Force TCP to avoid Named Pipes issues with remote servers.
# Named Pipes is sqlcmd's default and often fails on remote hosts.
$tcpServer = if ($server -match '^(tcp:|np:|lpc:)') { $server } else { "tcp:$server" }

# Base args used for every sqlcmd call
$baseArgs = [System.Collections.Generic.List[string]]::new()
$baseArgs.AddRange([string[]]@('-S', $tcpServer, '-l', '30'))   # 30-second login timeout
if ($trusted) {
    $baseArgs.Add('-E')
} else {
    $baseArgs.AddRange([string[]]@('-U', $userId, '-P', $password))
}
# -C trusts the server certificate; supported on ODBC Driver 17.1+ and 18+
if ($trustCert) { $baseArgs.Add('-C') }

$sqlcmd = Get-Command sqlcmd -ErrorAction SilentlyContinue
if (-not $sqlcmd) {
    Write-Log 'sqlcmd not found. Please run SQL\CsvFolderImporter.sql manually and update [dbo].[Settings].' 'WARN'
    exit 0
}

# ── Run the DDL script (creates DB, tables, seeds settings) ───────────────────
$sqlScriptPath = Join-Path $scriptDir 'SQL\CsvFolderImporter.sql'
if (Test-Path $sqlScriptPath) {
    Write-Log 'Running CsvFolderImporter.sql...'
    # Connect to master so CREATE DATABASE succeeds; the script switches via USE statements.
    $ddlArgs = $baseArgs.ToArray() + @('-d', 'master', '-i', $sqlScriptPath)
    $output = & sqlcmd @ddlArgs 2>&1
    $output | ForEach-Object { Write-Log $_ }
    if ($LASTEXITCODE -ne 0) {
        Write-Log 'SQL DDL script reported errors (see above). The database may need to be created manually.' 'WARN'
    } else {
        Write-Log 'SQL DDL script completed.'
    }
}
else {
    Write-Log "SQL script not found at: $sqlScriptPath" 'WARN'
}

# ── Upsert RootFolderPath and PollIntervalMinutes in [dbo].[Settings] ─────────
Write-Log 'Updating [dbo].[Settings]...'

$escapedRoot = $rootFolderPath.Replace("'", "''")
$settingsSql = @"
USE [CsvFolderImporter];
IF EXISTS (SELECT 1 FROM [dbo].[Settings] WHERE [Name] = 'RootFolderPath')
    UPDATE [dbo].[Settings] SET [Value] = '$escapedRoot', [IsEnabled] = 1 WHERE [Name] = 'RootFolderPath';
ELSE
    INSERT INTO [dbo].[Settings] ([Name],[Value],[IsEnabled]) VALUES ('RootFolderPath','$escapedRoot',1);

IF EXISTS (SELECT 1 FROM [dbo].[Settings] WHERE [Name] = 'PollIntervalMinutes')
    UPDATE [dbo].[Settings] SET [Value] = '$pollIntervalMinutes', [IsEnabled] = 1 WHERE [Name] = 'PollIntervalMinutes';
ELSE
    INSERT INTO [dbo].[Settings] ([Name],[Value],[IsEnabled]) VALUES ('PollIntervalMinutes','$pollIntervalMinutes',1);
"@

$settingsArgs = $baseArgs.ToArray() + @('-Q', $settingsSql)
$output = & sqlcmd @settingsArgs 2>&1
$output | ForEach-Object { Write-Log $_ }
if ($LASTEXITCODE -eq 0) {
    Write-Log 'Settings table updated.'
} else {
    Write-Log 'Failed to update Settings table (see above). Update manually if needed.' 'WARN'
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
                -BinaryPathName $exePath `
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
