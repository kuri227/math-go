from unittest.mock import Mock

import backend.app.recognizers.process_cleanup as cleanup


def test_windows_cleanup_targets_only_the_owned_pid_tree(monkeypatch):
    process = Mock(pid=1234)
    run = Mock()
    monkeypatch.setattr(cleanup.os, "name", "nt")
    monkeypatch.setattr(cleanup.subprocess, "run", run)
    cleanup.terminate_owned_process(process)
    run.assert_called_once_with(["taskkill", "/PID", "1234", "/T", "/F"], capture_output=True, timeout=5, check=False)
    process.terminate.assert_not_called()


def test_posix_cleanup_uses_the_owned_process(monkeypatch):
    process = Mock()
    monkeypatch.setattr(cleanup.os, "name", "posix")
    cleanup.terminate_owned_process(process)
    process.terminate.assert_called_once()
