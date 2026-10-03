$ErrorActionPreference = "Stop"
$RepoRoot = Split-Path -Parent $PSScriptRoot
$Python = Join-Path $RepoRoot ".venv\Scripts\python.exe"
& $Python -m uvicorn backend.app.main:app --host 127.0.0.1 --port 8000

