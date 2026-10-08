"""Verify the Windows PowerShell 5.1 parser, not just PowerShell 7."""
import base64
from pathlib import Path
import shutil
import subprocess

import pytest

ROOT = Path(__file__).resolve().parents[1]


def test_scripts_are_ascii_for_bomless_windows_powershell_compatibility():
    for script in (ROOT / "scripts").glob("*.ps1"):
        # Windows PowerShell reads BOM-less files using the local ANSI codepage.
        # Keep these portable scripts ASCII; Japanese user guidance lives in docs.
        assert script.read_bytes().isascii(), script.name


def test_all_scripts_parse_in_windows_powershell():
    powershell = shutil.which("powershell.exe")
    if not powershell:
        pytest.skip("Windows PowerShell is not installed on this platform")
    scripts = str(ROOT / "scripts").replace("'", "''")
    command = f"""
    $failed = $false
    Get-ChildItem -LiteralPath '{scripts}' -Filter '*.ps1' | ForEach-Object {{
        $tokens = $null
        $parseErrors = $null
        [System.Management.Automation.Language.Parser]::ParseFile($_.FullName, [ref]$tokens, [ref]$parseErrors) | Out-Null
        if ($parseErrors) {{ $failed = $true; Write-Output $_.Name; Write-Output $parseErrors }}
    }}
    if ($failed) {{ exit 1 }}
    Write-Output 'All scripts parse in Windows PowerShell.'
    """
    encoded = base64.b64encode(command.encode("utf-16-le")).decode("ascii")
    result = subprocess.run([powershell, "-NoProfile", "-EncodedCommand", encoded], capture_output=True, timeout=30)
    assert result.returncode == 0, (result.stdout + result.stderr).decode(errors="replace")
