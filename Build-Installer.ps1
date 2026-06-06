<#
.SYNOPSIS
    Publishes CsvFolderImporter and builds the WiX v7 MSI installer.
    Run this script from the solution root (C:\ClaudeOutput\CsvFolderImporter\).

.PREREQUISITES
    - .NET 9 SDK
    - WiX v7 global tool: dotnet tool install --global wix
    - The WiX EULA is accepted once by this script automatically (wix eula accept wix7).

.EXAMPLE
    .\Build-Installer.ps1
    .\Build-Installer.ps1 -Configuration Release
#>
param(
    [ValidateSet('Debug','Release')]
    [string]$Configuration = 'Release'
)

$ErrorActionPreference = 'Stop'
$root         = $PSScriptRoot
$publishDir   = Join-Path $root    'publish'
$installerDir = Join-Path $root    'Installer'
$outDir       = Join-Path $installerDir "bin\$Configuration"

function Write-Step([string]$msg) {
    Write-Host ""
    Write-Host "==> $msg" -ForegroundColor Cyan
}

# ── 0. Verify and accept WiX ──────────────────────────────────────────────────
Write-Step "Checking WiX installation..."
if (-not (Get-Command wix -ErrorAction SilentlyContinue)) {
    Write-Host "WiX tool not found. Install it with:" -ForegroundColor Yellow
    Write-Host "  dotnet tool install --global wix" -ForegroundColor Yellow
    exit 1
}
Write-Host "  Found WiX $(& wix --version 2>&1 | Select-String '\d+\.\d+\.\d+' | ForEach-Object { $_.Matches[0].Value })"
Write-Host "  Accepting EULA..."
& wix eula accept wix7 2>&1 | Out-Null   # idempotent — safe to run every time

# ── 1. Add required extensions (idempotent) ────────────────────────────────────
Write-Step "Adding WiX extensions..."
& wix extension add -g WixToolset.UI.wixext   2>&1 | Write-Host

# ── 2. Publish the .NET app ───────────────────────────────────────────────────
Write-Step "Publishing CsvFolderImporter ($Configuration)..."
dotnet publish "$root\CsvFolderImporter.csproj" `
    -c $Configuration `
    -r win-x64 `
    --self-contained false `
    -o $publishDir
if ($LASTEXITCODE -ne 0) { throw "dotnet publish failed." }

# ── 3. Copy installer assets into publish output ──────────────────────────────
Write-Step "Copying installer assets..."
$publishSqlDir = Join-Path $publishDir 'SQL'
New-Item -ItemType Directory -Path $publishSqlDir -Force | Out-Null
Copy-Item "$root\SQL\CsvFolderImporter.sql" $publishSqlDir -Force
Copy-Item "$root\setup.ps1"                 $publishDir    -Force
Write-Host "  Copied SQL script and setup.ps1."

# ── 4. Generate DefaultValues.wxi from appsettings.json ──────────────────────
Write-Step "Reading defaults from appsettings.json..."
$appsettings  = Get-Content (Join-Path $publishDir 'appsettings.json') | ConvertFrom-Json
$defaultCs    = $appsettings.ConnectionStrings.CsvFolderImporter

# Also read RootFolderPath and PollIntervalMinutes from appsettings if present,
# otherwise use sensible defaults (actual values live in [dbo].[Settings]).
$defaultRoot  = 'C:\ImportData'
$defaultPoll  = '5'

# Escape double-quotes inside the values for WiX XML attribute context
$escapedCs   = $defaultCs   -replace '"', '&quot;'
$escapedRoot = $defaultRoot -replace '"', '&quot;'

$wxi = @"
<?xml version="1.0" encoding="utf-8"?>
<Include xmlns="http://wixtoolset.org/schemas/v4/wxs">
  <?define DefaultConnectionString = "$escapedCs" ?>
  <?define DefaultRootFolderPath   = "$escapedRoot" ?>
  <?define DefaultPollMinutes      = "$defaultPoll" ?>
</Include>
"@
Set-Content (Join-Path $installerDir 'DefaultValues.wxi') $wxi -Encoding UTF8
Write-Host "  DefaultConnectionString = $($defaultCs.Substring(0,[Math]::Min(50,$defaultCs.Length)))..."

# ── 6. Generate AppFiles.wxs from the publish output ─────────────────────────
Write-Step "Generating AppFiles.wxs..."
New-Item -ItemType Directory -Path $outDir -Force | Out-Null

# Build a map of relative subdirectory path -> WiX Directory Id
$srcRoot  = $publishDir.TrimEnd('\')
$allFiles = Get-ChildItem $srcRoot -File -Recurse | Sort-Object FullName

# Collect ALL unique relative subdirectory paths, including intermediate ancestors.
# Without this, a file at e.g. "de\sub\foo.dll" would only add "de\sub" to the
# list, leaving the intermediate "de" directory undeclared and causing WIX0094.
$relDirsSet = [System.Collections.Generic.HashSet[string]]::new(
    [System.StringComparer]::OrdinalIgnoreCase)
foreach ($f in $allFiles) {
    $relDir = $f.DirectoryName.Substring($srcRoot.Length).TrimStart('\')
    if ($relDir -eq '') { continue }
    $parts = $relDir -split '\\'
    for ($i = 1; $i -le $parts.Count; $i++) {
        $relDirsSet.Add(($parts[0..($i - 1)] -join '\')) | Out-Null
    }
}
$relDirs = $relDirsSet | Sort-Object

# Assign stable IDs to each subdirectory
$dirIdMap = @{}
$di = 0
foreach ($d in $relDirs) {
    $di++
    $dirIdMap[$d] = "Dir$di"
}

function Get-DirId([string]$relDir) {
    if ($relDir -eq '') { return 'INSTALLFOLDER' }
    return $dirIdMap[$relDir]
}

$wxs = [System.Collections.Generic.List[string]]::new()

$wxs.Add('<?xml version="1.0" encoding="utf-8"?>')
$wxs.Add('<Wix xmlns="http://wixtoolset.org/schemas/v4/wxs">')
$wxs.Add('  <Fragment>')

# ── Directory declarations ────────────────────────────────────────────────────
if ($relDirs.Count -gt 0) {
    $wxs.Add('    <DirectoryRef Id="INSTALLFOLDER">')

    # Build a parent→children map for tree output
    $children = @{}   # parent relDir -> list of child relDirs
    foreach ($d in $relDirs) {
        $parts  = $d -split '\\'
        $parent = if ($parts.Count -gt 1) { ($parts[0..($parts.Count - 2)]) -join '\' } else { '' }
        if (-not $children.ContainsKey($parent)) { $children[$parent] = @() }
        $children[$parent] += $d
    }

    function Write-DirTree([string]$parentRelDir, [int]$depth) {
        $kids = $children[$parentRelDir]
        if (-not $kids) { return }
        foreach ($kid in ($kids | Sort-Object)) {
            $id      = Get-DirId $kid
            $name    = ($kid -split '\\')[-1]
            $indent  = '    ' * $depth + '      '
            $wxs.Add("$indent<Directory Id=""$id"" Name=""$name"">")
            Write-DirTree $kid ($depth + 1)
            $wxs.Add("$indent</Directory>")
        }
    }
    Write-DirTree '' 0

    $wxs.Add('    </DirectoryRef>')
}

# ── Component group ───────────────────────────────────────────────────────────
$wxs.Add('    <ComponentGroup Id="AppFiles">')

$fi = 0
foreach ($file in $allFiles) {
    $fi++
    $relDir = $file.DirectoryName.Substring($srcRoot.Length).TrimStart('\')
    $dirRef = Get-DirId $relDir
    $wxs.Add("      <Component Id=""Cmp$fi"" Directory=""$dirRef"" Guid=""*"">")
    $wxs.Add("        <File Id=""File$fi"" Source=""$($file.FullName)"" KeyPath=""yes"" />")
    $wxs.Add("      </Component>")
}

$wxs.Add('    </ComponentGroup>')
$wxs.Add('  </Fragment>')
$wxs.Add('</Wix>')

$appFilesWxs = Join-Path $outDir 'AppFiles.wxs'
$wxs | Set-Content $appFilesWxs -Encoding UTF8
Write-Host "  Generated: $appFilesWxs ($fi files)"

# ── 7. Build the MSI ─────────────────────────────────────────────────────────
Write-Step "Building MSI..."
$msiPath = Join-Path $outDir 'CsvFolderImporterSetup.msi'

& wix build `
    "$installerDir\Package.wxs" `
    "$installerDir\Dialogs\SqlConfigDlg.wxs" `
    $appFilesWxs `
    -ext WixToolset.UI.wixext `
    -arch x64 `
    -out $msiPath
if ($LASTEXITCODE -ne 0) { throw "wix build failed." }

# ── 8. Report ─────────────────────────────────────────────────────────────────
Write-Step "Done!"
Write-Host "  MSI: $msiPath" -ForegroundColor Green
