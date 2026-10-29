"""Check local links in current docs; preserve historical records as written."""
from pathlib import Path
import re
from urllib.parse import unquote, urlsplit

ROOT = Path(__file__).resolve().parents[1]
CURRENT = ["README.md", "PRODUCT.md", "DESIGN.md", "HANDOFF.md", "docs/README.md", "docs/architecture.md",
           "docs/festival-operation.md", "docs/two-mode-exhibition.md", "docs/texteller-training.md",
           "docs/question-authoring-guide.md", "docs/model-evaluation-guide.md", "docs/development-history.md",
           "docs/product-and-roadmap.md", "docs/dual-screen-controller-ux.md",
           "docs/adr/0004-current-stack-and-controller-direction.md"]


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


if __name__ == "__main__":
    missing = broken_links(ROOT / name for name in CURRENT)
    print("\n".join(missing) if missing else f"Current documentation: {len(CURRENT)} files; local links OK")
    raise SystemExit(bool(missing))
