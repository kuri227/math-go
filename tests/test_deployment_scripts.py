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


def test_setup_resolves_pins_with_editable_package_without_invalid_extra_constraints(monkeypatch):
    setup = module("setup_festival")
    calls = []
    monkeypatch.setattr(setup.sys, "argv", ["setup_festival.py", "--runtime-only", "--skip-build", "--device", "cpu"])
    monkeypatch.setattr(setup, "ensure_venv", lambda name: Path(name) / "python")
    monkeypatch.setattr(setup, "run", lambda *args, **kwargs: calls.append(tuple(str(arg) for arg in args)))
    setup.main()
    install = next(call for call in calls if "-e" in call)
    assert "-r" in install and "-c" not in install
    assert install[install.index("-r") + 1].endswith("festival.txt")
    assert any(call[0].startswith(".venv-texteller-cpu") for call in calls)


def test_cpu_preflight_uses_separate_model_environment(monkeypatch):
    check = module("preflight")
    monkeypatch.delenv("TEXTELLER_PYTHON", raising=False)
    assert ".venv-texteller-cpu" in str(check.venv_python("texteller", "cpu"))
    assert ".venv-texteller-cpu" not in str(check.venv_python("texteller", "cuda"))


def test_registry_cpu_default_never_selects_gpu_environment(monkeypatch):
    from backend.app.recognizers.registry import _venv_python
    monkeypatch.delenv("TEXTELLER_PYTHON", raising=False)
    monkeypatch.setenv("TEXTELLER_DEVICE", "cpu")
    assert ".venv-texteller-cpu" in str(_venv_python("texteller"))


def test_ready_cpu_install_does_not_require_nvidia_driver(monkeypatch, tmp_path):
    import backend.app.game_questions as questions
    check = module("preflight")
    monkeypatch.setattr(check, "ROOT", tmp_path)
    monkeypatch.setattr(check.shutil, "which", lambda _: None)
    monkeypatch.setattr(questions, "get_questions", lambda: [object()])
    monkeypatch.setattr(check.subprocess, "run", lambda *args, **kwargs: subprocess.CompletedProcess(args, 0, '{"cuda":false,"torch":"2.14.0+cpu"}'))
    for name in ("TEXTELLER_PYTHON", "TEXTELLER_MODEL_DIR"):
        monkeypatch.delenv(name, raising=False)
    paths = [check.venv_python("base", "cpu"), check.venv_python("texteller", "cpu")]
    paths += [tmp_path / ".model-cache/texteller" / name for name in ("model.safetensors", "config.json", "tokenizer.json", "tokenizer_config.json")]
    paths += [tmp_path / "game/dist" / name for name in ("index.html", "display.html", "controller.html", "game-assets/test.js")]
    for path in paths:
        path.parent.mkdir(parents=True, exist_ok=True)
        path.touch()
    assert not any(row["status"] == "FAIL" for row in check.inspect(True, "cpu"))
