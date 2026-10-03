$ErrorActionPreference = "Stop"
$RepoRoot = Split-Path -Parent $PSScriptRoot
$Python = Join-Path $RepoRoot ".venv\Scripts\python.exe"
$GameRoot = Join-Path $RepoRoot "game"

$Backend = Start-Process -FilePath $Python -ArgumentList "-m", "uvicorn", "backend.app.main:app", "--host", "127.0.0.1", "--port", "8000" -WorkingDirectory $RepoRoot -WindowStyle Hidden -PassThru
try {
    Push-Location $GameRoot
    pnpm dev
} finally {
    Pop-Location
    if (!$Backend.HasExited) {
        Stop-Process -Id $Backend.Id
    }
}

