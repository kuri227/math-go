"""Dispose only the owned model process, including Windows venv launchers."""
import os
import subprocess


def terminate_owned_process(process: subprocess.Popen) -> None:
    if os.name == "nt":
        # venv's python.exe can be a launcher for another python.exe. Killing
        # only the launcher leaves inference running and its stdout pipe open.
        subprocess.run(
            ["taskkill", "/PID", str(process.pid), "/T", "/F"],
            capture_output=True, timeout=5, check=False,
        )
    else:
        process.terminate()

