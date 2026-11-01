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

import errno
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

# `file write failed` is what torch's PytorchStreamWriter raises when a save runs out of space
# (an assumption that a full disk produces it; a miss shows as `unknown` with the raw message).
_DISK_FULL_MESSAGE = re.compile(
    r"no space left on device|database or disk is full|file write failed", re.IGNORECASE
)

# Ultralytics wraps every dataset-load failure into a RuntimeError "Dataset '<yaml>' error ...".
_DATASET_WRAPPER_PREFIX = "Dataset '"
_DATASET_MESSAGE = re.compile(
    r"No labels found in|No valid images found in"
    r"|Segment dataset requires equal numbers of boxes and segments",
    re.IGNORECASE,
)

_WEIGHTS_DOWNLOAD_TYPES = frozenset(
    {
        "WeightsDownloadError",
        "ConnectionError",
        "URLError",
        "gaierror",
        "TimeoutError",
        "MaxRetryError",
    }
)
_NOT_RESUMABLE_TYPES = frozenset({"NotResumableError", "CheckpointError"})

# Exit codes of a process the system stopped: a negative code is a POSIX signal (-9 is the
# out-of-memory killer), 137 and 143 are the shell forms of SIGKILL and SIGTERM, and Windows has
# no signals, so a terminated process reports 0xC000013A.
_KILLED_EXIT_CODES = frozenset({137, 143, 3221225786})


def normalize_category(value: object) -> str:
    """`value` when it is one of the seven codes, else `unknown`."""
    return value if isinstance(value, str) and value in CATEGORIES else UNKNOWN


def _is_out_of_memory(type_name: str, message: str) -> bool:
    return type_name in _OUT_OF_MEMORY_TYPES or _OUT_OF_MEMORY_MESSAGE.search(message) is not None


def _is_disk_full(message: str, errno_code: int | None) -> bool:
    return errno_code == errno.ENOSPC or _DISK_FULL_MESSAGE.search(message) is not None


def _is_invalid_dataset(message: str) -> bool:
    wrapped = message.startswith(_DATASET_WRAPPER_PREFIX) and "error" in message.lower()
    return wrapped or _DATASET_MESSAGE.search(message) is not None


def classify_exception(type_name: str, message: str, errno_code: int | None = None) -> str:
    """The category of an exception raised in the training process, from its type and text.

    Ordered, first match wins: out of memory, disk full, invalid dataset, weights download,
    not resumable, unknown.
    """
    if _is_out_of_memory(type_name, message):
        return OUT_OF_MEMORY
    if _is_disk_full(message, errno_code):
        return DISK_FULL
    if _is_invalid_dataset(message):
        return INVALID_DATASET
    if type_name in _WEIGHTS_DOWNLOAD_TYPES:
        return WEIGHTS_DOWNLOAD
    if type_name in _NOT_RESUMABLE_TYPES:
        return NOT_RESUMABLE
    return UNKNOWN


def classify_exit(exit_code: int | None, log_tail: str) -> str:
    """The category of a process that left no usable `error.json`, from its exit and log tail.

    A killed process is told by its exit code alone. Otherwise only the memory and disk rules
    read the log tail: Ultralytics prints a PyPI version notice on every run, so a network
    category is never derived from log text.
    """
    if exit_code is None:
        return UNKNOWN
    if exit_code < 0 or exit_code in _KILLED_EXIT_CODES:
        return PROCESS_KILLED
    if _OUT_OF_MEMORY_MESSAGE.search(log_tail) is not None:
        return OUT_OF_MEMORY
    if _DISK_FULL_MESSAGE.search(log_tail) is not None:
        return DISK_FULL
    return UNKNOWN
