from scripts.check_docs import CURRENT, ROOT, broken_links


def test_current_documentation_has_no_broken_local_links():
    assert broken_links(ROOT / name for name in CURRENT) == []


def test_doc_checker_reports_missing_relative_files_but_ignores_web_links(tmp_path):
    doc = tmp_path / "readme.md"
    doc.write_text("[missing](missing.md) [web](https://example.com/a) [section](#title)")
    assert len(broken_links([doc])) == 1
