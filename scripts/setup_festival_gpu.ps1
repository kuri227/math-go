[CmdletBinding()]
param([string]$Python = "python")
$ErrorActionPreference = "Stop"
& (Join-Path $PSScriptRoot "setup_festival.ps1") -Python $Python -Device cuda
