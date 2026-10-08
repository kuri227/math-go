[CmdletBinding()]
param(
    [ValidateRange(1, 65535)][int]$Port = 8000,
    [switch]$NoBrowser,
    [switch]$SingleScreen
)
$ErrorActionPreference = "Stop"
$PreviousModelPython = $env:TEXTELLER_PYTHON
try {
    $env:TEXTELLER_PYTHON = Join-Path (Split-Path -Parent $PSScriptRoot) ".venv-texteller\Scripts\python.exe"
    & (Join-Path $PSScriptRoot "start_festival.ps1") -Device cuda -Port $Port -NoBrowser:$NoBrowser -SingleScreen:$SingleScreen
} finally { $env:TEXTELLER_PYTHON = $PreviousModelPython }
