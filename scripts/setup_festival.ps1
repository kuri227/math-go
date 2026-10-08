[CmdletBinding()]
param(
    [string]$Python = "python",
    [ValidateSet("cuda", "cpu")][string]$Device = "cuda",
    [switch]$IncludeEvaluationModels
)
$ErrorActionPreference = "Stop"
$SetupArgs = @((Join-Path $PSScriptRoot "setup_festival.py"), "--runtime-only", "--device", $Device)
if ($IncludeEvaluationModels) { $SetupArgs += "--with-evaluation" }
& $Python @SetupArgs
if ($LASTEXITCODE -ne 0) { throw "Festival setup failed (exit $LASTEXITCODE)." }
