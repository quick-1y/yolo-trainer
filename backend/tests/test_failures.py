"""The failure classifier (TRAN-11, D-16): literal-message fixtures for every rule and its order.

No Ultralytics or torch mocks: each case is the text a real failure produces, so a rule change
cannot silently drift. The order of the rules is part of the contract (first match wins).
"""

from __future__ import annotations

import errno

import pytest

from yolo_trainer_common.failures import (
    CATEGORIES,
    DISK_FULL,
    INVALID_DATASET,
    NOT_RESUMABLE,
    OUT_OF_MEMORY,
    PROCESS_KILLED,
    UNKNOWN,
    WEIGHTS_DOWNLOAD,
    classify_exception,
    classify_exit,
    normalize_category,
)


def test_the_seven_codes_are_the_contract_with_the_worker_the_database_and_the_catalog() -> None:
    assert CATEGORIES == {
        "out_of_memory",
        "disk_full",
        "invalid_dataset",
        "weights_download",
        "process_killed",
        "not_resumable",
        "unknown",
    }


@pytest.mark.parametrize(
    ("type_name", "message", "category"),
    [
        # out of memory
        ("OutOfMemoryError", "CUDA out of memory. Tried to allocate 2.00 GiB.", OUT_OF_MEMORY),
        ("MemoryError", "", OUT_OF_MEMORY),
        ("RuntimeError", "CUDA error: CUBLAS_STATUS_ALLOC_FAILED", OUT_OF_MEMORY),
        (
            "RuntimeError",
            "[enforce fail at alloc_cpu.cpp] DefaultCPUAllocator: can't allocate memory",
            OUT_OF_MEMORY,
        ),
        ("RuntimeError", "DefaultCPUAllocator: Out Of Memory", OUT_OF_MEMORY),
        # disk full
        ("OSError", "[Errno 28] No space left on device", DISK_FULL),
        (
            "RuntimeError",
            "PytorchStreamWriter failed writing file data/0: file write failed",
            DISK_FULL,
        ),
        ("OperationalError", "(sqlite3.OperationalError) database or disk is full", DISK_FULL),
        # invalid dataset
        (
            "RuntimeError",
            "Dataset '/data/runs/3/dataset/data.yaml' error ❌ train: images not found",
            INVALID_DATASET,
        ),
        (
            "RuntimeError",
            "No labels found in /data/runs/1/dataset/train/labels.cache",
            INVALID_DATASET,
        ),
        ("RuntimeError", "No valid images found in /data/runs/1/dataset/train", INVALID_DATASET),
        (
            "ValueError",
            "Segment dataset requires equal numbers of boxes and segments, but found 3 and 4.",
            INVALID_DATASET,
        ),
        # weights download
        ("WeightsDownloadError", "Could not download yolo26n.pt.", WEIGHTS_DOWNLOAD),
        ("URLError", "<urlopen error [Errno 11001] getaddrinfo failed>", WEIGHTS_DOWNLOAD),
        ("ConnectionError", "Max retries exceeded", WEIGHTS_DOWNLOAD),
        ("gaierror", "[Errno -2] Name or service not known", WEIGHTS_DOWNLOAD),
        ("TimeoutError", "timed out", WEIGHTS_DOWNLOAD),
        ("MaxRetryError", "HTTPSConnectionPool(host='github.com', port=443)", WEIGHTS_DOWNLOAD),
        # not resumable
        ("NotResumableError", "The checkpoint is missing.", NOT_RESUMABLE),
        ("CheckpointError", "last.pt is damaged.", NOT_RESUMABLE),
        # everything else
        ("ValueError", "something else", UNKNOWN),
        ("RuntimeError", "", UNKNOWN),
    ],
)
def test_classify_exception_matches_literal_messages(
    type_name: str, message: str, category: str
) -> None:
    assert classify_exception(type_name, message) == category


def test_an_enospc_errno_is_a_full_disk_whatever_the_message_says() -> None:
    assert classify_exception("OSError", "write failed", errno.ENOSPC) == DISK_FULL
    assert classify_exception("OSError", "write failed", errno.EACCES) == UNKNOWN
    assert classify_exception("OSError", "write failed", None) == UNKNOWN


@pytest.mark.parametrize(
    ("type_name", "message", "category"),
    [
        # Out of memory is checked before everything else.
        (
            "RuntimeError",
            "CUDA out of memory while writing: No space left on device",
            OUT_OF_MEMORY,
        ),
        ("OutOfMemoryError", "Dataset 'x' error ❌ train: No labels found in y", OUT_OF_MEMORY),
        # Disk full comes before the dataset wrapper and the download rules.
        ("OSError", "Dataset 'x' error ❌ train: No space left on device", DISK_FULL),
        ("WeightsDownloadError", "[Errno 28] No space left on device", DISK_FULL),
        # The dataset wrapper comes before the download rule.
        ("ConnectionError", "No labels found in /data/runs/1/dataset", INVALID_DATASET),
    ],
)
def test_the_rules_are_ordered_and_the_first_match_wins(
    type_name: str, message: str, category: str
) -> None:
    assert classify_exception(type_name, message) == category


def test_a_dataset_message_needs_both_the_wrapper_prefix_and_the_error_marker() -> None:
    assert classify_exception("RuntimeError", "Dataset 'x' is fine") == UNKNOWN
    assert classify_exception("RuntimeError", "see Dataset 'x' error ❌") == UNKNOWN


def test_matching_ignores_case() -> None:
    assert classify_exception("RuntimeError", "CUDA OUT OF MEMORY") == OUT_OF_MEMORY
    assert classify_exception("OSError", "no space left on device") == DISK_FULL


@pytest.mark.parametrize("code", [-9, -15, 137, 143, 3221225786])
def test_a_signal_or_termination_exit_code_without_a_message_is_a_killed_process(
    code: int,
) -> None:
    assert classify_exit(code, "") == PROCESS_KILLED


def test_an_exit_code_decides_before_the_log_text() -> None:
    assert classify_exit(-9, "CUDA out of memory") == PROCESS_KILLED


@pytest.mark.parametrize(
    ("exit_code", "log_tail", "category"),
    [
        (1, "epoch 3/10\nCUDA out of memory. Tried to allocate 2.00 GiB.", OUT_OF_MEMORY),
        (1, "OSError: [Errno 28] No space left on device", DISK_FULL),
        # Ultralytics prints a PyPI version notice on every run: never a network failure.
        (1, "New https://pypi.org/project/ultralytics/8.4.175 available", UNKNOWN),
        (1, "ConnectionError: Max retries exceeded", UNKNOWN),
        (3, "about to crash", UNKNOWN),
        (1, "", UNKNOWN),
        (0, "", UNKNOWN),
        (None, "", UNKNOWN),
        (None, "CUDA out of memory", UNKNOWN),
    ],
)
def test_classify_exit_reads_the_log_tail_only_for_memory_and_disk(
    exit_code: int | None, log_tail: str, category: str
) -> None:
    assert classify_exit(exit_code, log_tail) == category


@pytest.mark.parametrize("code", sorted(CATEGORIES))
def test_normalize_category_keeps_every_allowed_code(code: str) -> None:
    assert normalize_category(code) == code


@pytest.mark.parametrize(
    "value",
    ["bogus", "", "OUT_OF_MEMORY", "<img src=x onerror=alert(1)>", None, 3, ["unknown"]],
)
def test_normalize_category_turns_anything_else_into_unknown(value: object) -> None:
    assert normalize_category(value) == UNKNOWN
