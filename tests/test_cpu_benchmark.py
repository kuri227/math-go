import importlib.util
from pathlib import Path


def test_cpu_benchmark_summary_includes_tail_latency():
    path = Path(__file__).resolve().parents[1] / "scripts/benchmark_cpu.py"
    spec = importlib.util.spec_from_file_location("cpu_benchmark", path)
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    result = module.summarize([100, 200, 300, 400])
    assert result == {"count": 4, "mean_ms": 250, "median_ms": 250, "p95_ms": 400, "max_ms": 400}
