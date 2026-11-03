[CmdletBinding()]
param(
    [ValidateRange(1, 65535)][int]$Port = 8000,
    [switch]$Lan,
    [switch]$NoBrowser,
    [switch]$SingleScreen,
    [ValidateSet("auto", "cuda", "cpu")][string]$Device = "auto"
)

$ErrorActionPreference = "Stop"
$LanMessage = "LAN hosting is disabled. Start the game locally on each PC and use HTTPS only for ranking synchronization."
if ($Lan) { throw $LanMessage }
$RepoRoot = Split-Path -Parent $PSScriptRoot
$Python = Join-Path $RepoRoot ".venv\Scripts\python.exe"
$BindHost = "127.0.0.1"
$LocalUrl = "http://127.0.0.1:$Port"
$RuntimeDir = Join-Path $RepoRoot ".runtime"
$StdoutLog = Join-Path $RuntimeDir "server.stdout.log"
$StderrLog = Join-Path $RuntimeDir "server.stderr.log"

& (Join-Path $PSScriptRoot "check_environment.ps1") -RequireReady -Port $Port -Device $Device
New-Item -ItemType Directory -Force -Path $RuntimeDir | Out-Null

$env:HMER_EAGER_MODELS = "texteller"
$env:TEXTELLER_DEVICE = $Device
$StartupWatch = [Diagnostics.Stopwatch]::StartNew()
$Server = Start-Process -FilePath $Python `
    -ArgumentList "-m", "uvicorn", "backend.app.main:app", "--host", $BindHost, "--port", "$Port", "--no-server-header" `
    -WorkingDirectory $RepoRoot -WindowStyle Hidden -PassThru `
    -RedirectStandardOutput $StdoutLog -RedirectStandardError $StderrLog

try {
    Write-Host "Loading TexTeller. CPU or slower PCs may take longer."
    $Ready = $false
    # The worker owns the 180-second model deadline. Keep a small margin so the
    # launcher can surface the worker's actual failure instead of racing it.
    $ReadyDeadline = [DateTime]::UtcNow.AddSeconds(195)
    $NextProgressAt = 10
    while ([DateTime]::UtcNow -lt $ReadyDeadline) {
        if ($Server.HasExited) {
            $Detail = if (Test-Path $StderrLog) { Get-Content $StderrLog -Tail 30 | Out-String } else { "" }
            throw "The server exited during startup.`n$Detail"
        }
        $FailureDetail = $null
        try {
            $Health = Invoke-RestMethod "$LocalUrl/api/v1/health/ready?model=texteller" -TimeoutSec 2
            if ($Health.status -eq "ready") {
                $Ready = $true
                break
            }
            if ($Health.status -eq "unavailable" -and $Health.detail) {
                $FailureDetail = $Health.detail
            }
        } catch { }
        if ($FailureDetail) {
            throw "TexTeller failed during startup: $FailureDetail"
        }
        $ElapsedSeconds = [Math]::Floor($StartupWatch.Elapsed.TotalSeconds)
        if ($ElapsedSeconds -ge $NextProgressAt) {
            Write-Host "Still loading TexTeller... ${ElapsedSeconds}s"
            $NextProgressAt += 10
        }
        Start-Sleep -Seconds 1
    }
    if (-not $Ready) {
        throw "TexTeller was not ready within 195 seconds. Check .runtime/server.stderr.log and results/logs/texteller.log."
    }

    $GameUrl = if ($SingleScreen) { $LocalUrl } else { "$LocalUrl/display" }
    $StartupWatch.Stop()
    Write-Host "Ready in $([Math]::Round($StartupWatch.Elapsed.TotalSeconds, 2)) seconds."
    Write-Host "Math GO: $GameUrl"
    if (-not $NoBrowser) {
        Start-Process $GameUrl
    }
    Write-Host "Press Ctrl+C in this window to stop the server."
    Wait-Process -Id $Server.Id
} finally {
    if (-not $Server.HasExited) {
        Stop-Process -Id $Server.Id
    }
}
