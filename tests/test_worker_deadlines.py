import sys
import subprocess
import time
from pathlib import Path

import pytest
from PIL import Image, ImageDraw

from backend.app.recognizers.input_image import require_visible_content
from backend.app.recognizers.worker import WorkerError, WorkerRecognizer


@pytest.fixture
def worker(tmp_path):
    instance = WorkerRecognizer(
        name="test", variant="test", device="cpu", python_executable=Path(sys.executable),
        worker_script=Path(__file__).parent / "fixtures/protocol_worker.py", cwd=tmp_path,
        log_path=tmp_path / "worker.log", startup_timeout=3, inference_timeout=.2,
    )
    image = Image.new("RGB", (40, 40), "white")
    ImageDraw.Draw(image).line((10, 10, 20, 25), fill="black", width=3)
    image.save(tmp_path / "answer.png")
    yield instance, tmp_path / "answer.png"
    instance.close(force=True)


@pytest.mark.parametrize("mode", ["hang", "mismatch", "exit"])
def test_fault_discards_process_and_next_request_uses_a_fresh_inbox(worker, mode):
    instance, image = worker
    instance.extra_env["TEST_WORKER_MODE"] = mode
    instance.start()
    process, reader = instance._process, instance._reader
    started = time.monotonic()
    with pytest.raises(WorkerError):
        instance.recognize(image)
    assert time.monotonic() - started < 4
    assert process.poll() is not None
    assert not reader.thread.is_alive()
    assert not instance.available and instance._reader is None
    instance.extra_env["TEST_WORKER_MODE"] = "ok"
    assert instance.recognize(image).latex == "1"
    assert instance._process.pid != process.pid


def test_startup_deadline_closes_stalled_process(worker):
    instance, _ = worker
    instance.extra_env["TEST_WORKER_MODE"] = "startup-hang"
    instance.startup_timeout = .2
    started = time.monotonic()
    instance.start()
    assert time.monotonic() - started < 4
    assert not instance.available and instance._process is None
    assert "deadline" in instance.detail


@pytest.mark.skipif(sys.platform != "win32", reason="Windows venv launcher integration")
def test_windows_venv_child_does_not_survive_timeout(worker, tmp_path):
    instance, image = worker
    launcher = Path(__file__).parents[1] / ".venv/Scripts/python.exe"
    if not launcher.is_file():
        pytest.skip("No Windows venv launcher installed")
    instance.python_executable = launcher
    pid_path = tmp_path / "child.pid"
    instance.extra_env.update(TEST_WORKER_MODE="hang", TEST_PID_PATH=str(pid_path))
    instance.start()
    child_pid = pid_path.read_text(encoding="ascii")
    with pytest.raises(WorkerError):
        instance.recognize(image)
    listing = subprocess.run(["tasklist", "/FI", f"PID eq {child_pid}", "/NH"], capture_output=True, text=True, timeout=5)
    assert child_pid not in listing.stdout


@pytest.mark.parametrize("color", ["white", "black", (255, 255, 255, 0)])
def test_uniform_image_rejected_before_model_start(worker, color):
    instance, path = worker
    Image.new("RGBA", (30, 30), color).save(path)
    with pytest.raises(WorkerError, match="式を書いて"):
        instance.recognize(path)
    assert instance._process is None


def test_tiny_point_and_thin_minus_are_not_mistaken_for_blank(tmp_path):
    for coordinates in [(10, 10, 10, 10), (10, 10, 20, 10)]:
        image = Image.new("RGB", (30, 30), "white")
        ImageDraw.Draw(image).line(coordinates, fill="black", width=1)
        path = tmp_path / "point.png"
        image.save(path)
        require_visible_content(path)
