[CmdletBinding()]
param(
    [switch]$RequireReady,
    [int]$Port = 8000
)

$ErrorActionPreference = "Stop"
$RepoRoot = Split-Path -Parent $PSScriptRoot
$Checks = [System.Collections.Generic.List[object]]::new()

function Add-Check {
    param(
        [string]$Name,
        [bool]$Ok,
        [string]$Detail,
        [bool]$Required = $false
    )
    $Checks.Add([pscustomobject]@{
        Check = $Name
        Status = if ($Ok) { "OK" } elseif ($Required) { "NG" } else { "WARN" }
        Detail = $Detail
        Required = $Required
    })
}

$IsWindowsHost = $env:OS -eq "Windows_NT"
Add-Check "Windows" $IsWindowsHost $(if ($IsWindowsHost) { [Environment]::OSVersion.VersionString } else { "Windows版Releaseです" }) $true
Add-Check "PowerShell" ($PSVersionTable.PSVersion.Major -ge 5) $PSVersionTable.PSVersion.ToString() $true

$PythonCommand = Get-Command python -ErrorAction SilentlyContinue
if ($PythonCommand) {
    $PythonVersion = (& $PythonCommand.Source --version 2>&1 | Out-String).Trim()
    $VersionMatch = [regex]::Match($PythonVersion, '(\d+)\.(\d+)')
    $SupportedPython = $VersionMatch.Success -and [int]$VersionMatch.Groups[1].Value -eq 3 -and [int]$VersionMatch.Groups[2].Value -ge 10 -and [int]$VersionMatch.Groups[2].Value -lt 13
    Add-Check "Python command" $SupportedPython "$PythonVersion（3.10〜3.12が必要）" $true
} else {
    Add-Check "Python command" $false "Python 3.10〜3.12をインストールしてください" $true
}

$NvidiaSmi = Get-Command nvidia-smi -ErrorAction SilentlyContinue
if ($NvidiaSmi) {
    $Gpu = (& $NvidiaSmi.Source --query-gpu=name,memory.total,driver_version --format=csv,noheader 2>&1 | Out-String).Trim()
    Add-Check "NVIDIA GPU" ($LASTEXITCODE -eq 0) $Gpu $true
} else {
    Add-Check "NVIDIA GPU" $false "nvidia-smiが見つかりません" $true
}

$BasePython = Join-Path $RepoRoot ".venv\Scripts\python.exe"
$TexTellerPython = Join-Path $RepoRoot ".venv-texteller\Scripts\python.exe"
$TexTellerWeights = Join-Path $RepoRoot ".model-cache\texteller\model.safetensors"
$GameIndex = Join-Path $RepoRoot "game\dist\index.html"
Add-Check "Web runtime" (Test-Path $BasePython) ".venv" $RequireReady
Add-Check "TexTeller runtime" (Test-Path $TexTellerPython) ".venv-texteller" $RequireReady
Add-Check "TexTeller weights" (Test-Path $TexTellerWeights) ".model-cache/texteller" $RequireReady
Add-Check "Game build" (Test-Path $GameIndex) "game/dist/index.html" $RequireReady

$Listener = Get-NetTCPConnection -LocalPort $Port -State Listen -ErrorAction SilentlyContinue
Add-Check "Port $Port" (-not $Listener) $(if ($Listener) { "既に使用中です" } else { "利用可能" })

$Checks | Select-Object Check, Status, Detail | Format-Table -AutoSize
$Failures = @($Checks | Where-Object { $_.Required -and $_.Status -eq "NG" })
if ($Failures.Count -gt 0) {
    throw "必須項目が$($Failures.Count)件不足しています。setup_festival.ps1を実行してください。"
}

Write-Host "Environment check completed."
