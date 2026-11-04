"""Check local links in current docs; preserve historical records as written."""
from pathlib import Path
import re
from urllib.parse import unquote, urlsplit

ROOT = Path(__file__).resolve().parents[1]
CURRENT = ["README.md", "PRODUCT.md", "DESIGN.md", "THIRD_PARTY_NOTICES.md", "docs/README.md", "docs/installation.md",
           "docs/development.md", "docs/architecture.md", "docs/festival-operation.md",
           "docs/two-mode-exhibition.md", "docs/texteller-training.md", "docs/question-authoring-guide.md",
           "docs/model-evaluation-guide.md", "docs/recognition_service_requirements.md",
           "docs/development-history.md", "docs/product-and-roadmap.md", "docs/source-code-guide.md",
           "docs/dual-screen-controller-ux.md", "docs/ranking-system-proposal.md",
           "docs/security-and-firebase-checklist.md",
           "docs/test-developer-workspace-design.md",
           "docs/adr/0004-current-stack-and-controller-direction.md"]
POWERSHELL_BLOCK = re.compile(r"```powershell\s*\n(.*?)\n```", re.DOTALL | re.IGNORECASE)
COMMENTED_COMMAND = re.compile(r"^\s*#\s*(?:\.\\|git\s|pnpm\s|npm\s|python\s|Set-ExecutionPolicy\b)", re.IGNORECASE)
SCRIPT_REFERENCE = re.compile(r"\.\\scripts\\([A-Za-z0-9_.-]+\.ps1)", re.IGNORECASE)
ANGLE_PLACEHOLDER = re.compile(r"<[^>\r\n]+>")


def broken_links(paths):
    failures = []
    for path in paths:
        for target in re.findall(r"!?\[[^\]]*\]\(([^)]+)\)", path.read_text(encoding="utf-8")):
            target = target.strip().strip("<>")
            parsed = urlsplit(target)
            if parsed.scheme or parsed.netloc or not parsed.path:
                continue
            destination = path.parent / unquote(parsed.path)
            if not destination.exists():
                failures.append(f"{path}: {target}")
    return failures


def command_block_issues(paths):
    """Reject PowerShell examples that require readers to edit commands before use."""
    failures = []
    for path in paths:
        text = path.read_text(encoding="utf-8")
        for block_number, match in enumerate(POWERSHELL_BLOCK.finditer(text), start=1):
            block = match.group(1)
            for line_number, line in enumerate(block.splitlines(), start=1):
                if COMMENTED_COMMAND.match(line):
                    failures.append(f"{path}: PowerShell block {block_number}, line {line_number}: commented command")
                if ANGLE_PLACEHOLDER.search(line):
                    failures.append(f"{path}: PowerShell block {block_number}, line {line_number}: replaceable placeholder")
            for script_name in SCRIPT_REFERENCE.findall(block):
                if not (ROOT / "scripts" / script_name).is_file():
                    failures.append(f"{path}: PowerShell block {block_number}: missing scripts/{script_name}")
    return failures


if __name__ == "__main__":
    paths = [ROOT / name for name in CURRENT]
    failures = broken_links(paths) + command_block_issues(paths)
    print("\n".join(failures) if failures else f"Current documentation: {len(CURRENT)} files; links and copy-ready commands OK")
    raise SystemExit(bool(failures))
