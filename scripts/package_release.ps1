[CmdletBinding()]
param(
    [string]$Version = "0.1.0-alpha.1",
    [switch]$SkipBuild
)

$ErrorActionPreference = "Stop"
$RepoRoot = Split-Path -Parent $PSScriptRoot
$ReleaseRoot = Join-Path $RepoRoot "release-build"
$PackageName = "math-go-$Version-windows"
$StageRoot = Join-Path $ReleaseRoot $PackageName
$ArchivePath = Join-Path $ReleaseRoot "$PackageName.zip"

if ($Version -notmatch '^[0-9]+\.[0-9]+\.[0-9]+(?:-[0-9A-Za-z.-]+)?$') {
    throw "Invalid release version: $Version"
}

if (-not $SkipBuild) {
    & (Join-Path $PSScriptRoot "build_game.ps1")
}
if (-not (Test-Path (Join-Path $RepoRoot "game\dist\index.html"))) {
    throw "game/dist is missing. Build the game before packaging."
}

New-Item -ItemType Directory -Force -Path $ReleaseRoot | Out-Null
$ResolvedReleaseRoot = [IO.Path]::GetFullPath($ReleaseRoot).TrimEnd('\') + '\'
$ResolvedStageRoot = [IO.Path]::GetFullPath($StageRoot)
if (-not $ResolvedStageRoot.StartsWith($ResolvedReleaseRoot, [StringComparison]::OrdinalIgnoreCase)) {
    throw "Unsafe staging path: $ResolvedStageRoot"
}
if (Test-Path $StageRoot) { Remove-Item -LiteralPath $StageRoot -Recurse -Force }
if (Test-Path $ArchivePath) { Remove-Item -LiteralPath $ArchivePath -Force }
New-Item -ItemType Directory -Force -Path $StageRoot | Out-Null

$Files = @("README.md", "VERSION", "pyproject.toml")
$Directories = @("backend", "config", "frontend", "game\dist")
$ScriptFiles = @(
    "build_game.ps1",
    "check_environment.ps1",
    "setup_models.ps1",
    "setup_festival.ps1",
    "start_festival.ps1"
)

foreach ($File in $Files) {
    Copy-Item -LiteralPath (Join-Path $RepoRoot $File) -Destination (Join-Path $StageRoot $File)
}
foreach ($Directory in $Directories) {
    $Destination = Join-Path $StageRoot $Directory
    New-Item -ItemType Directory -Force -Path (Split-Path -Parent $Destination) | Out-Null
    Copy-Item -LiteralPath (Join-Path $RepoRoot $Directory) -Destination $Destination -Recurse
}
$StageScripts = Join-Path $StageRoot "scripts"
New-Item -ItemType Directory -Force -Path $StageScripts | Out-Null
foreach ($Script in $ScriptFiles) {
    Copy-Item -LiteralPath (Join-Path $PSScriptRoot $Script) -Destination (Join-Path $StageScripts $Script)
}

$Manifest = [ordered]@{
    version = $Version
    generated_at = (Get-Date).ToString("o")
    package = $PackageName
    files = @(Get-ChildItem -LiteralPath $StageRoot -File -Recurse | ForEach-Object {
        $_.FullName.Substring($StageRoot.Length + 1).Replace('\', '/')
    } | Sort-Object)
}
$Manifest | ConvertTo-Json -Depth 4 | Set-Content -LiteralPath (Join-Path $StageRoot "release-manifest.json") -Encoding UTF8

Compress-Archive -LiteralPath $StageRoot -DestinationPath $ArchivePath -CompressionLevel Optimal
& (Join-Path $PSScriptRoot "test_release.ps1") -ArchivePath $ArchivePath

$Hash = (Get-FileHash -LiteralPath $ArchivePath -Algorithm SHA256).Hash.ToLowerInvariant()
"$Hash  $([IO.Path]::GetFileName($ArchivePath))" | Set-Content -LiteralPath "$ArchivePath.sha256" -Encoding ASCII
Write-Host "Release package: $ArchivePath"
Write-Host "SHA-256: $Hash"
