import subprocess
import sys
import time
from pathlib import Path

import pytest
from backend.training.execution_lock import execution_lock
from backend.app.recognizers.process_cleanup import terminate_owned_process


def test_os_lock_blocks_live_process_and_releases_after_termination(tmp_path):
    marker = tmp_path / "ready"
    script = Path(__file__).parent / "fixtures/training_lock_holder.py"
    process = subprocess.Popen([sys.executable, str(script), str(tmp_path), str(marker)], stdin=subprocess.PIPE)
    try:
        deadline = time.monotonic() + 5
        while not marker.exists() and time.monotonic() < deadline:
            time.sleep(.01)
        assert marker.exists(), "Lock holder did not start"
        with pytest.raises(ValueError, match="active"):
            with execution_lock(tmp_path):
                pass
        terminate_owned_process(process); process.wait(timeout=5)
        with execution_lock(tmp_path):
            pass
    finally:
        if process.poll() is None:
            terminate_owned_process(process); process.wait(timeout=5)
        if process.stdin:
            process.stdin.close()
