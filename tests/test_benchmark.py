import csv

from backend.app.recognizers.base import Recognition
from backend.app.recognizers.worker import WorkerError
from benchmark.run_benchmark import FIELDS, recognize_with_recovery, successful_rows


def test_resume_retains_only_successful_rows(tmp_path):
    output = tmp_path / "results.csv"
    success = {field: "" for field in FIELDS}
    success.update(sample_id="a", model="texteller", status="success")
    failure = {field: "" for field in FIELDS}
    failure.update(sample_id="b", model="texteller", status="error")
    with output.open("w", encoding="utf-8", newline="") as handle:
        writer = csv.DictWriter(handle, fieldnames=FIELDS)
        writer.writeheader()
        writer.writerows([success, failure])
    assert [row["sample_id"] for row in successful_rows(output)] == ["a"]


def test_worker_failure_restarts_and_retries_once(tmp_path):
    class FakeRecognizer:
        name = "texteller"
        available = True

        def __init__(self):
            self.calls = 0
            self.closed = 0
            self.started = 0

        def recognize(self, _):
            self.calls += 1
            if self.calls == 1:
                raise WorkerError("poisoned CUDA context")
            return Recognition("x", 1.0, self.name, "test", "cuda")

        def close(self):
            self.closed += 1

        def start(self):
            self.started += 1

    recognizer = FakeRecognizer()
    image = tmp_path / "image.png"
    result = recognize_with_recovery(recognizer, image, image)
    assert result.latex == "x"
    assert recognizer.closed == 1
    assert recognizer.started == 1

