"""Default class colors (D-15).

Same list, in the same order, as `frontend/src/lib/classPalette.ts`. Three
colors from the usual 20-color set (maroon, navy and dark gray) are left out:
they are about 1.1-1.3:1 against the dark UI surfaces or too close to UI grays.
"""

from __future__ import annotations

from collections.abc import Iterable

CLASS_PALETTE: tuple[str, ...] = (
    "#E6194B",
    "#3CB44B",
    "#FFE119",
    "#4363D8",
    "#F58231",
    "#911EB4",
    "#46F0F0",
    "#F032E6",
    "#BCF60C",
    "#FABEBE",
    "#008080",
    "#E6BEFF",
    "#9A6324",
    "#FFFAC8",
    "#AAFFC3",
    "#808000",
    "#FFD8B1",
)


def next_color(used_colors: Iterable[str], class_count: int) -> str:
    """First palette color not yet used in the project, else cycle by class count."""
    used = {color.upper() for color in used_colors}
    for color in CLASS_PALETTE:
        if color not in used:
            return color
    return CLASS_PALETTE[class_count % len(CLASS_PALETTE)]
