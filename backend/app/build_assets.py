"""Resolve shared CSS through the Vite manifest rather than guessing hash names."""
def entry_styles(manifest: dict, entry: str) -> list[str]:
    visited, styles = set(), []
    def visit(key):
        if key in visited:
            return
        visited.add(key)
        record = manifest.get(key, {})
        for child in record.get("imports", []):
            visit(child)
        for path in record.get("css", []):
            if not isinstance(path, str) or not path.startswith("game-assets/") or ".." in path:
                raise ValueError("Unsafe build asset path")
            if path not in styles:
                styles.append(path)
    visit(entry)
    return styles
