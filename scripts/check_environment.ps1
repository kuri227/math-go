[CmdletBinding()]
param(
    [switch]$RequireReady,
    [ValidateSet("auto", "cuda", "cpu")][string]$Device = "auto",
    [string]$Python = "python",
    [int]$Port = 0
)
$ErrorActionPreference = "Stop"
$RepoRoot = Split-Path -Parent $PSScriptRoot
$BasePython = Join-Path $RepoRoot ".venv\Scripts\python.exe"
if (Test-Path -LiteralPath $BasePython) { $Python = $BasePython }
$CheckArgs = @((Join-Path $PSScriptRoot "preflight.py"), "--device", $Device)
if ($RequireReady) { $CheckArgs += "--require-ready" }
if ($Port -gt 0) { $CheckArgs += @("--port", "$Port") }
& $Python @CheckArgs
if ($LASTEXITCODE -ne 0) { throw "Environment check failed (exit $LASTEXITCODE). See docs/festival-operation.md." }
