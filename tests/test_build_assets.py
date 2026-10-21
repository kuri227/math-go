import pytest
from backend.app.build_assets import entry_styles


def test_shared_styles_are_resolved_once_even_with_circular_imports():
    manifest = {"support": {"imports": ["shared"]}, "shared": {"imports": ["support"], "css": ["game-assets/math.css"]}}
    assert entry_styles(manifest, "support") == ["game-assets/math.css"]


def test_rejects_escaping_asset_path():
    with pytest.raises(ValueError):
        entry_styles({"support": {"css": ["../private.css"]}}, "support")
