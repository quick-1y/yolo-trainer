"""Seeded allocation of images to train/valid/test (DATA-05, D-03).

Pure: no database and no I/O, so the same ids, ratios and seed always give the same
assignment. The routes use it twice, once for the preview and once for the confirmed
apply, which is what makes "apply exactly what was shown" checkable.
"""

from __future__ import annotations

import random

SPLITS = ("train", "valid", "test")


def auto_split(ids: list[int], train: int, valid: int, test: int, seed: int) -> dict[int, str]:
    """Assign every id to one split by whole-percentage ratios.

    The ids are sorted ascending and then shuffled with a generator seeded by `seed`, so the result
    does not depend on the order they arrive in. Test and Valid sizes are rounded half up
    in integer arithmetic; Valid gets at least one image when `n >= 2` and Test at least
    one when its ratio is above 0 and `n >= 4`. Train is whatever is left and always keeps
    at least one image: Test shrinks first, then Valid. `train` is implied by the other two
    because the ratios add up to 100.
    """
    ordered = sorted(ids)
    count = len(ordered)
    if count == 0:
        return {}
    random.Random(seed).shuffle(ordered)

    test_size = (count * test + 50) // 100
    valid_size = (count * valid + 50) // 100
    if valid > 0 and count >= 2:
        valid_size = max(valid_size, 1)
    if test > 0 and count >= 4:
        test_size = max(test_size, 1)

    overflow = valid_size + test_size - (count - 1)
    if overflow > 0:
        from_test = min(overflow, test_size)
        test_size -= from_test
        valid_size -= overflow - from_test

    assignment: dict[int, str] = {}
    for position, image_id in enumerate(ordered):
        if position < test_size:
            assignment[image_id] = "test"
        elif position < test_size + valid_size:
            assignment[image_id] = "valid"
        else:
            assignment[image_id] = "train"
    return assignment


def split_counts(assignment: dict[int, str]) -> dict[str, int]:
    """How many images each split got; all three keys are always present."""
    values = list(assignment.values())
    return {split: values.count(split) for split in SPLITS}
