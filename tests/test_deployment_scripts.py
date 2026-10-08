import importlib.util
from pathlib import Path
import subprocess

import pytest

ROOT = Path(__file__).resolve().parents[1]


def module(name):
    spec = importlib.util.spec_from_file_location(name, ROOT / "scripts" / f"{name}.py")
    result = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(result)
    return result


def test_setup_stops_on_external_command_failure(monkeypatch):
    setup = module("setup_festival")
    def fail(*args, **kwargs):
        assert kwargs["check"] is True
        raise subprocess.CalledProcessError(7, args[0])
    monkeypatch.setattr(setup.subprocess, "run", fail)
    with pytest.raises(subprocess.CalledProcessError):
        setup.run("not-installed", "build")


@pytest.mark.parametrize("device,index", [("cuda", "cu132"), ("cpu", "cpu")])
def test_torch_install_is_pinned_and_device_specific(monkeypatch, device, index):
    setup = module("setup_festival")
    calls = []
    monkeypatch.setattr(setup, "run", lambda *args, **kwargs: calls.append(args))
    setup.install_torch(Path("python"), device, None, "2.14.0", "0.29.0")
    assert "torch==2.14.0" in calls[0]
    assert calls[0][-1].endswith("/" + index)


def test_preflight_fails_for_an_unbuilt_clone(monkeypatch, tmp_path):
    check = module("preflight")
    monkeypatch.setattr(check, "ROOT", tmp_path)
    monkeypatch.setattr(check.shutil, "which", lambda _: None)
    for name in ("TEXTELLER_PYTHON", "TEXTELLER_MODEL_DIR"):
        monkeypatch.delenv(name, raising=False)
    rows = check.inspect(True, "cpu")
    assert any(row["check"] == "Build: display.html" and row["status"] == "FAIL" for row in rows)
    assert next(row for row in rows if row["check"] == "NVIDIA driver")["status"] == "WARN"
