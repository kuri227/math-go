"""Validate handwriting structure separately from HTTP and persistence."""
import json
import math


def validate_strokes(strokes_json: str) -> dict:
    strokes = json.loads(strokes_json)
    if not isinstance(strokes, dict) or not isinstance(strokes.get("strokes"), list) or not strokes["strokes"]:
        raise ValueError("Non-empty strokes required")
    if len(strokes["strokes"]) > 10000:
        raise ValueError("Too many strokes")
    allowed = {"mouse", "pen", "touch", "unknown"}
    pointer_types = strokes.get("pointer_types", [])
    if not isinstance(pointer_types, list) or any(not isinstance(p, str) or p not in allowed for p in pointer_types):
        raise ValueError("Invalid pointer types")
    for stroke in strokes["strokes"]:
        if not isinstance(stroke, dict) or not isinstance(stroke.get("points"), list) or not stroke["points"]:
            raise ValueError("Invalid stroke points")
        pointer = stroke.get("pointerType", "unknown")
        if not isinstance(pointer, str) or pointer not in allowed:
            raise ValueError("Invalid pointer type")
        for point in stroke["points"]:
            if not isinstance(point, dict) or any(type(point.get(axis)) not in (int, float) or not math.isfinite(point[axis]) for axis in ("x", "y")):
                raise ValueError("Invalid point coordinates")
    return strokes
