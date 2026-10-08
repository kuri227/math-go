from __future__ import annotations

import re


_SPACING_COMMANDS = re.compile(r"\\(?:,|;|!|quad|qquad|\s)")
_WHITESPACE = re.compile(r"\s+")
_SINGLE_SCRIPT_GROUP = re.compile(r"([_^])\{([A-Za-z0-9])\}")
_CONTROL_WORD_BOUNDARY = re.compile(r"(\\[A-Za-z]+)\s+(?=[A-Za-z])")
_CONTROL_WORD_SEPARATOR = "\ue000"


def _strip_math_delimiters(value: str) -> str:
    """Remove one pair of outer TeX math-mode delimiters."""
    pairs = ((r"\[", r"\]"), (r"\(", r"\)"), ("$$", "$$"), ("$", "$"))
    for opening, closing in pairs:
        if value.startswith(opening) and value.endswith(closing):
            return value[len(opening) : len(value) - len(closing)].strip()
    return value


def normalize_latex(value: str) -> str:
    """Normalize presentation-only differences without claiming equivalence."""
    value = _strip_math_delimiters(value.strip())
    value = value.replace("\\left", "").replace("\\right", "")
    value = value.replace("\\dfrac", "\\frac").replace("\\tfrac", "\\frac")
    value = _SPACING_COMMANDS.sub("", value)
    # A space after an alphabetic TeX control word terminates that command.
    # Removing it would turn valid ``\cos x`` into the unknown command
    # ``\cosx``. Preserve only boundaries that are syntactically required;
    # all other presentation whitespace remains removable.
    value = _CONTROL_WORD_BOUNDARY.sub(rf"\1{_CONTROL_WORD_SEPARATOR}", value)
    value = _WHITESPACE.sub("", value)
    value = value.replace(_CONTROL_WORD_SEPARATOR, " ")
    value = _SINGLE_SCRIPT_GROUP.sub(r"\1\2", value)
    while value.startswith("{") and value.endswith("}"):
        depth = 0
        wraps_all = True
        for index, char in enumerate(value):
            depth += char == "{"
            depth -= char == "}"
            if depth == 0 and index != len(value) - 1:
                wraps_all = False
                break
        if not wraps_all:
            break
        value = value[1:-1]
    return value

