[CmdletBinding()]
param([switch]$ConfirmSingleUse)
$ErrorActionPreference = "Stop"
$RepoRoot = Split-Path -Parent $PSScriptRoot
$Python = Join-Path $RepoRoot ".venv-texteller\Scripts\python.exe"
if (-not $ConfirmSingleUse) { throw "Read docs/texteller-training.md; then pass -ConfirmSingleUse. Reserved samples are never retried." }
& $Python (Join-Path $PSScriptRoot "train_texteller.py") run --device cuda --confirm-single-use
if ($LASTEXITCODE -ne 0) { throw "Training failed or was refused. Inspect the ledger; do not delete it or retry old data." }
