[CmdletBinding()]
param(
    [int]$Port = 8000,
    [switch]$Lan,
    [switch]$NoBrowser
)

$ErrorActionPreference = "Stop"
$RepoRoot = Split-Path -Parent $PSScriptRoot
$Python = Join-Path $RepoRoot ".venv\Scripts\python.exe"
$BindHost = if ($Lan) { "0.0.0.0" } else { "127.0.0.1" }
$LocalUrl = "http://127.0.0.1:$Port"
$RuntimeDir = Join-Path $RepoRoot ".runtime"
$StdoutLog = Join-Path $RuntimeDir "server.stdout.log"
$StderrLog = Join-Path $RuntimeDir "server.stderr.log"

& (Join-Path $PSScriptRoot "check_environment.ps1") -RequireReady -Port $Port
New-Item -ItemType Directory -Force -Path $RuntimeDir | Out-Null

$env:HMER_EAGER_MODELS = "texteller"
$Server = Start-Process -FilePath $Python `
    -ArgumentList "-m", "uvicorn", "backend.app.main:app", "--host", $BindHost, "--port", "$Port" `
    -WorkingDirectory $RepoRoot -WindowStyle Hidden -PassThru `
    -RedirectStandardOutput $StdoutLog -RedirectStandardError $StderrLog

try {
    Write-Host "TexTellerを読み込んでいます。初回は数秒かかります。"
    $Ready = $false
    for ($Attempt = 0; $Attempt -lt 180; $Attempt++) {
        if ($Server.HasExited) {
            $Detail = if (Test-Path $StderrLog) { Get-Content $StderrLog -Tail 30 | Out-String } else { "" }
            throw "サーバーが起動中に終了しました。`n$Detail"
        }
        try {
            $Health = Invoke-RestMethod "$LocalUrl/api/v1/health/live" -TimeoutSec 2
            if ($Health.status -eq "ok") {
                $Ready = $true
                break
            }
        } catch {
            Start-Sleep -Seconds 1
        }
    }
    if (-not $Ready) {
        throw "サーバーが3分以内に起動しませんでした。"
    }

    Write-Host "数学でGO: $LocalUrl"
    if ($Lan) {
        $Addresses = Get-NetIPAddress -AddressFamily IPv4 -ErrorAction SilentlyContinue |
            Where-Object { $_.IPAddress -notmatch '^(127\.|169\.254\.)' } |
            Select-Object -ExpandProperty IPAddress -Unique
        foreach ($Address in $Addresses) {
            Write-Host "LAN access: http://${Address}:$Port"
        }
        Write-Warning "LAN利用時はWindows FirewallでTCP $Port の受信許可が必要な場合があります。"
    }
    if (-not $NoBrowser) {
        Start-Process $LocalUrl
    }
    Write-Host "停止するにはこの画面でCtrl+Cを押してください。"
    Wait-Process -Id $Server.Id
} finally {
    if (-not $Server.HasExited) {
        Stop-Process -Id $Server.Id
    }
}
