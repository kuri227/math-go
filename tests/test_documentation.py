from scripts.check_docs import CURRENT, ROOT, broken_links, command_block_issues


def test_current_documentation_has_no_broken_local_links():
    assert broken_links(ROOT / name for name in CURRENT) == []


def test_doc_checker_reports_missing_relative_files_but_ignores_web_links(tmp_path):
    doc = tmp_path / "readme.md"
    doc.write_text("[missing](missing.md) [web](https://example.com/a) [section](#title)")
    assert len(broken_links([doc])) == 1


def test_current_documentation_has_copy_ready_powershell_commands():
    assert command_block_issues(ROOT / name for name in CURRENT) == []


def test_doc_checker_rejects_commented_commands_and_replaceable_placeholders(tmp_path):
    doc = tmp_path / "commands.md"
    doc.write_text(
        "```powershell\n# .\\scripts\\start_festival_gpu.ps1\ncommand --run-id <RUN_ID>\n```",
        encoding="utf-8",
    )
    issues = command_block_issues([doc])
    assert any("commented command" in issue for issue in issues)
    assert any("replaceable placeholder" in issue for issue in issues)


def test_installation_guide_matches_single_and_dual_screen_startup_contract():
    guide = (ROOT / "docs" / "installation.md").read_text(encoding="utf-8")

    assert ".\\scripts\\start_festival_cpu.ps1 -SingleScreen" in guide
    assert ".\\scripts\\start_festival_gpu.ps1 -SingleScreen" in guide
    assert "指定なしでは2画面用のモニター画面" in guide
    assert "http://127.0.0.1:8000" in guide
    assert "Python 3.10.5" in guide
    assert "python-3.10.11-amd64.exe" in guide


def test_current_docs_include_installation_and_development_guides():
    assert "docs/installation.md" in CURRENT
    assert "docs/development.md" in CURRENT
    assert "docs/source-code-guide.md" in CURRENT
    assert "THIRD_PARTY_NOTICES.md" in CURRENT
    assert "HANDOFF.md" not in CURRENT


def test_project_license_and_notice_are_declared_consistently():
    assert "Apache License" in (ROOT / "LICENSE").read_text(encoding="utf-8")
    assert "Copyright 2026 kuri227" in (ROOT / "NOTICE").read_text(encoding="utf-8")
    assert 'license = "Apache-2.0"' in (ROOT / "pyproject.toml").read_text(encoding="utf-8")
    assert '"license": "Apache-2.0"' in (ROOT / "game" / "package.json").read_text(encoding="utf-8")
