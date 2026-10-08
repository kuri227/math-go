[CmdletBinding()]
param(
    [string]$Python = "python",
    [ValidateSet("tiny", "small", "base")][string]$UniMERNetVariant = "tiny",
    [ValidateSet("cuda", "cpu")][string]$Device = "cuda",
    [switch]$SkipUniMERNet,
    [switch]$RuntimeOnly
)
$ErrorActionPreference = "Stop"
$SetupArgs = @((Join-Path $PSScriptRoot "setup_festival.py"), "--device", $Device, "--skip-build", "--unimernet-variant", $UniMERNetVariant)
if (-not $SkipUniMERNet) { $SetupArgs += "--with-evaluation" }
if ($RuntimeOnly) { $SetupArgs += "--runtime-only" }
& $Python @SetupArgs
if ($LASTEXITCODE -ne 0) { throw "Model setup failed (exit $LASTEXITCODE)." }
