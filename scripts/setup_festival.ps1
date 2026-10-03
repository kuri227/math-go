[CmdletBinding()]
param(
    [string]$Python = "python",
    [switch]$IncludeEvaluationModels
)

$ErrorActionPreference = "Stop"
$RepoRoot = Split-Path -Parent $PSScriptRoot

Write-Host "[1/3] Checking the host PC"
& (Join-Path $PSScriptRoot "check_environment.ps1")

Write-Host "[2/3] Installing the Python runtime and model"
$SetupModels = Join-Path $PSScriptRoot "setup_models.ps1"
if ($IncludeEvaluationModels) {
    & $SetupModels -Python $Python -UniMERNetVariant tiny -RuntimeOnly
} else {
    & $SetupModels -Python $Python -RuntimeOnly -SkipUniMERNet
}

$GameIndex = Join-Path $RepoRoot "game\dist\index.html"
if (-not (Test-Path $GameIndex)) {
    Write-Host "[3/3] Building the game frontend"
    & (Join-Path $PSScriptRoot "build_game.ps1")
} else {
    Write-Host "[3/3] Using the bundled game build"
}

& (Join-Path $PSScriptRoot "check_environment.ps1") -RequireReady
Write-Host "Setup completed. Run scripts\start_festival.ps1 to start 数学でGO."
