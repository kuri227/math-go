[CmdletBinding()]
param(
    [ValidateRange(1, 65535)][int]$Port = 8000,
    [switch]$NoBrowser,
    [switch]$SingleScreen
)
$ErrorActionPreference = "Stop"
# Hide CUDA even when this PC happens to have an NVIDIA GPU.
$PreviousCudaVisibility = $env:CUDA_VISIBLE_DEVICES
$PreviousModelPython = $env:TEXTELLER_PYTHON
try {
    $env:CUDA_VISIBLE_DEVICES = ""
    $env:TEXTELLER_PYTHON = Join-Path (Split-Path -Parent $PSScriptRoot) ".venv-texteller-cpu\Scripts\python.exe"
    & (Join-Path $PSScriptRoot "start_festival.ps1") -Device cpu -Port $Port -NoBrowser:$NoBrowser -SingleScreen:$SingleScreen
} finally {
    $env:CUDA_VISIBLE_DEVICES = $PreviousCudaVisibility
    $env:TEXTELLER_PYTHON = $PreviousModelPython
}
