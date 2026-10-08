from pathlib import Path
from unittest.mock import Mock

import pytest

from backend.app.recognizers.worker import WorkerError, WorkerRecognizer


def test_cuda_failure_discards_worker_and_restarts_on_next_submission(tmp_path: Path):
    worker = WorkerRecognizer(
        name="texteller", variant="3.0", device="cuda",
        python_executable=tmp_path / "python", worker_script=tmp_path / "worker.py",
        cwd=tmp_path, log_path=tmp_path / "worker.log",
    )
    process = Mock()
    process.poll.return_value = None
    worker._process = process
    worker._read_protocol_message = Mock(side_effect=[
        {"error": "AcceleratorError: CUDA error: unknown error"},
        {"latex": "x=-3", "inference_ms": 10},
    ])

    with pytest.raises(WorkerError, match="次の提出"):
        worker.recognize(tmp_path / "answer.png")
    assert not worker.available
    assert "CUDA" in worker.detail
    assert worker._process is None
    process.wait.assert_called_once()

    def restart():
        worker._process = process
        worker._detail = None

    worker.start = Mock(side_effect=restart)
    result = worker.recognize(tmp_path / "answer.png")
    worker.start.assert_called_once()
    assert result.latex == "x=-3"
    assert worker.available
