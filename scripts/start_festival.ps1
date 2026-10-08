[CmdletBinding()]
param(
    [ValidateRange(1, 65535)][int]$Port = 8000,
    [switch]$Lan,
    [switch]$NoBrowser,
    [switch]$SingleScreen,
    [ValidateSet("auto", "cuda", "cpu")][string]$Device = "auto"
)

$ErrorActionPreference = "Stop"
$RepoRoot = Split-Path -Parent $PSScriptRoot
$Python = Join-Path $RepoRoot ".venv\Scripts\python.exe"
$BindHost = if ($Lan) { "0.0.0.0" } else { "127.0.0.1" }
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
    -ArgumentList "-m", "uvicorn", "backend.app.main:app", "--host", $BindHost, "--port", "$Port" `
    -WorkingDirectory $RepoRoot -WindowStyle Hidden -PassThru `
    -RedirectStandardOutput $StdoutLog -RedirectStandardError $StderrLog

try {
    Write-Host "Loading TexTeller. CPU or slower PCs may take longer."
    $Ready = $false
    $ReadyDeadline = [DateTime]::UtcNow.AddMinutes(3)
    while ([DateTime]::UtcNow -lt $ReadyDeadline) {
        if ($Server.HasExited) {
            $Detail = if (Test-Path $StderrLog) { Get-Content $StderrLog -Tail 30 | Out-String } else { "" }
            throw "The server exited during startup.`n$Detail"
        }
        try {
            $Health = Invoke-RestMethod "$LocalUrl/api/v1/health/ready?model=texteller" -TimeoutSec 2
            if ($Health.status -eq "ready") {
                $Ready = $true
                break
            }
        } catch { }
        Start-Sleep -Seconds 1
    }
    if (-not $Ready) {
        throw "TexTeller was not ready within 3 minutes. Check .runtime/server.stderr.log and results/logs/texteller.log."
    }

    $GameUrl = if ($SingleScreen) { $LocalUrl } else { "$LocalUrl/display" }
    $StartupWatch.Stop()
    Write-Host "Ready in $([Math]::Round($StartupWatch.Elapsed.TotalSeconds, 2)) seconds."
    Write-Host "Math GO: $GameUrl"
    if ($Lan) {
        $Addresses = Get-NetIPAddress -AddressFamily IPv4 -ErrorAction SilentlyContinue |
            Where-Object { $_.IPAddress -notmatch '^(127\.|169\.254\.)' } |
            Select-Object -ExpandProperty IPAddress -Unique
        foreach ($Address in $Addresses) {
            Write-Host "LAN access: http://${Address}:$Port"
        }
        Write-Warning "LAN access may require a Windows Firewall inbound rule for TCP $Port."
    }
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
