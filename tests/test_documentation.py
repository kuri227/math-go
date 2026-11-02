from scripts.check_docs import CURRENT, ROOT, broken_links


def test_current_documentation_has_no_broken_local_links():
    assert broken_links(ROOT / name for name in CURRENT) == []


def test_doc_checker_reports_missing_relative_files_but_ignores_web_links(tmp_path):
    doc = tmp_path / "readme.md"
    doc.write_text("[missing](missing.md) [web](https://example.com/a) [section](#title)")
    assert len(broken_links([doc])) == 1


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
