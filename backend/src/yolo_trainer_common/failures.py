"""Failure categories of a training run (D-16): a stable code per kind of failure.

Pure and torch-free (strings and integers only), so the api image, the worker supervisor and
the training subprocess can all import it. The codes are a contract between the worker, the
database (`training_runs.error_category`) and the i18n catalog of the UI: renaming one needs a
data migration, so the set below is fixed. A code read from a file or the database is checked
against `CATEGORIES` before it is stored (`normalize_category`).

Rules are ordered and the first match wins; the order matters (out of memory before everything
else, the Ultralytics dataset wrapper before the generic "No labels found" substrings).
"""

from __future__ import annotations

import re

OUT_OF_MEMORY = "out_of_memory"
DISK_FULL = "disk_full"
INVALID_DATASET = "invalid_dataset"
WEIGHTS_DOWNLOAD = "weights_download"
PROCESS_KILLED = "process_killed"
NOT_RESUMABLE = "not_resumable"
UNKNOWN = "unknown"

CATEGORIES = frozenset(
    {
        OUT_OF_MEMORY,
        DISK_FULL,
        INVALID_DATASET,
        WEIGHTS_DOWNLOAD,
        PROCESS_KILLED,
        NOT_RESUMABLE,
        UNKNOWN,
    }
)

_OUT_OF_MEMORY_TYPES = frozenset({"OutOfMemoryError", "MemoryError"})
_OUT_OF_MEMORY_MESSAGE = re.compile(
    r"out of memory|CUBLAS_STATUS_ALLOC_FAILED|can't allocate memory", re.IGNORECASE
)


def normalize_category(value: object) -> str:
    """`value` when it is one of the seven codes, else `unknown`."""
    return value if isinstance(value, str) and value in CATEGORIES else UNKNOWN


def _is_out_of_memory(type_name: str, message: str) -> bool:
    return type_name in _OUT_OF_MEMORY_TYPES or _OUT_OF_MEMORY_MESSAGE.search(message) is not None


def classify_exception(type_name: str, message: str, errno_code: int | None = None) -> str:
    """The category of an exception raised in the training process, from its type and text."""
    if _is_out_of_memory(type_name, message):
        return OUT_OF_MEMORY
    return UNKNOWN


def classify_exit(exit_code: int | None, log_tail: str) -> str:
    """The category of a process that left no usable `error.json`, from its exit and log tail."""
    if exit_code is None:
        return UNKNOWN
    if _OUT_OF_MEMORY_MESSAGE.search(log_tail) is not None:
        return OUT_OF_MEMORY
    return UNKNOWN
