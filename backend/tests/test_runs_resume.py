"""Resuming a run: the api requeues the same row, the worker continues from the checkpoint.

Real app, real worker queue, real supervisor and real child processes; only the training
command is the fake trainer (`fake_train_job.py`). The same run row, folder and charts are
reused across attempts (TRAN-07, D-09..D-13), and a Phase 4 run with a `last.pt` is resumable
too (D-10): its checkpoint epoch is derived from its progress events.
"""

from __future__ import annotations

import json
import threading

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import Engine, update
from sqlalchemy.orm import Session

from yolo_trainer_api.models import TrainedModel, TrainingRun
from yolo_trainer_api.settings import Settings
from yolo_trainer_api.training import service
from yolo_trainer_common import layout
from yolo_trainer_common.device import ComputeDevice
from yolo_trainer_worker import queue
from yolo_trainer_worker import supervisor as supervisor_module
from yolo_trainer_worker.supervisor import Supervisor

from .test_runs_cancel import _cancel, _queued_runs, _supervisor, _url
from .test_training_options import write_heartbeat
from .test_worker_supervisor import _in_thread, _Spawned, _wait_until
from .training_helpers import (
    XHR,
    fake_command,
    setup_project,
    start_run,
    wait_status,
    worker_settings,
)

CANNOT_RESUME = (
    "The saved checkpoint cannot be resumed: training had already finished or the checkpoint "
    "was refused. Start a new run instead."
)


def _resume(client: TestClient, project_id: int, run_id: int):
    return client.post(f"{_url(project_id, run_id)}/resume", headers=XHR)


def _row(engine: Engine, run_id: int) -> TrainingRun:
    with Session(engine) as session:
        run = session.get(TrainingRun, run_id)
        session.expunge(run)
        return run


def _write_weights(settings: Settings, run_id: int) -> None:
    weights = layout.last_weights(layout.run_dir(settings.data_dir, run_id))
    weights.parent.mkdir(parents=True, exist_ok=True)
    weights.write_bytes(b"last")


def _force(engine: Engine, run_id: int, **values: object) -> None:
    with Session(engine) as session, session.begin():
        session.execute(update(TrainingRun).where(TrainingRun.id == run_id).values(**values))


def _progress_events(settings: Settings, run_id: int) -> list[dict]:
    path = layout.run_dir(settings.data_dir, run_id) / layout.PROGRESS_FILE
    return [json.loads(line) for line in path.read_text(encoding="utf-8").splitlines() if line]


def _cancelled_with_checkpoint(
    client: TestClient, settings: Settings, monkeypatch: pytest.MonkeyPatch
) -> tuple[int, int, Engine, _Spawned]:
    """A run cancelled after its first epoch: `(project_id, run_id, engine, spawned)`."""
    spawned = _Spawned()
    spawned.install(monkeypatch)
    project_id, (run,) = _queued_runs(client, 1, "Resume")
    supervisor, engine = _supervisor(settings, "sleep")
    assert queue.claim_next(engine) == run["id"]
    thread, _ = _in_thread(lambda: supervisor.run_claimed(run["id"], threading.Event()))
    _wait_until(lambda: _row(engine, run["id"]).resume_epoch == 1)
    assert _cancel(client, project_id, run["id"]).status_code == 200
    thread.join(timeout=15)
    assert not thread.is_alive()
    wait_status(client, project_id, run["id"], {"cancelled"})
    return project_id, run["id"], engine, spawned


def test_a_cancelled_run_resumes_in_the_same_row_and_finishes_with_one_model(
    client: TestClient, settings: Settings, monkeypatch: pytest.MonkeyPatch
) -> None:
    project_id, run_id, engine, spawned = _cancelled_with_checkpoint(client, settings, monkeypatch)
    cancelled = client.get(_url(project_id, run_id)).json()
    assert cancelled["can_resume"] is True
    assert cancelled["resume_epoch"] == 1  # the supervisor recorded the checkpoint epoch
    first_start = _row(engine, run_id).started_at

    response = _resume(client, project_id, run_id)

    assert response.status_code == 200, response.text
    body = response.json()
    assert body["id"] == run_id
    assert body["status"] == "queued"
    assert body["resume_count"] == 1
    assert body["resume_epoch"] == 1
    assert body["can_resume"] is False  # a queued run is not resumable again
    assert body["queue_position"] == 1
    assert body["finished_at"] is None
    assert body["error_message"] is None
    assert body["error_category"] is None
    assert body["log_tail"] is None
    assert body["cancelling"] is False
    row = _row(engine, run_id)
    assert row.cancel_requested_at is None
    assert row.queued_at is not None

    # The stored resolution is reused: the request is never resolved again on a resume (D-11).
    def never_resolved(*args: object, **kwargs: object) -> None:
        raise AssertionError("a resumed segment must not resolve its settings again")

    monkeypatch.setattr(supervisor_module, "resolve_settings", never_resolved)
    resuming = Supervisor(
        engine,
        worker_settings(settings),
        ComputeDevice(cuda_available=False, device="cpu", device_name=None),
        command=fake_command("success"),
        tick_seconds=0.05,
    )
    assert queue.claim_next(engine) == run_id

    assert resuming.run_claimed(run_id, threading.Event()) == "completed"

    assert "--resume" in spawned.processes[-1].args
    assert "--resume" not in spawned.processes[0].args
    done = client.get(_url(project_id, run_id)).json()
    assert done["status"] == "completed"
    assert done["resume_count"] == 1
    assert done["resume_epoch"] is None  # a completed run has nothing to resume
    assert done["model"] is not None
    assert _row(engine, run_id).started_at == first_start  # the first start is kept (D-09)
    with Session(engine) as session:
        assert session.query(TrainedModel).count() == 1
    starts = [e for e in _progress_events(settings, run_id) if e["event"] == "train_start"]
    assert [(s["resumed"], s["start_epoch"]) for s in starts] == [(False, 0), (True, 1)]


def test_a_run_that_is_not_interrupted_cancelled_or_failed_cannot_be_resumed(
    client: TestClient, settings: Settings
) -> None:
    project_id, runs = _queued_runs(client, 3, "Statuses")
    queued, running, completed = runs
    engine = queue.create_worker_engine(worker_settings(settings))
    _force(engine, running["id"], status="running")
    _force(engine, completed["id"], status="completed")
    for run in runs:
        _write_weights(settings, run["id"])

    for run, status in ((queued, "queued"), (running, "running"), (completed, "completed")):
        response = _resume(client, project_id, run["id"])
        assert response.status_code == 409, status
        assert response.json()["detail"] == service.RUN_NOT_RESUMABLE_STATUS_DETAIL
        assert client.get(_url(project_id, run["id"])).json()["status"] == status
        assert _row(engine, run["id"]).resume_count == 0
        assert client.get(_url(project_id, run["id"])).json()["can_resume"] is False


def test_a_run_without_last_pt_is_refused_whatever_its_resume_epoch(
    client: TestClient, settings: Settings
) -> None:
    project_id, (run,) = _queued_runs(client, 1, "NoCheckpoint")
    engine = queue.create_worker_engine(worker_settings(settings))
    _force(engine, run["id"], status="cancelled", resume_epoch=2)

    detail = client.get(_url(project_id, run["id"])).json()
    response = _resume(client, project_id, run["id"])

    assert detail["can_resume"] is False
    assert response.status_code == 409
    assert response.json()["detail"] == (
        "No checkpoint was saved for this run yet. Start a new run instead."
    )
    assert _row(engine, run["id"]).status == "cancelled"  # nothing changed


def test_a_foreign_or_unknown_run_answers_404_and_resume_needs_the_xhr_header(
    client: TestClient, settings: Settings
) -> None:
    project_id, (run,) = _queued_runs(client, 1, "Guards")
    other = setup_project(client, "Other", train=1, valid=1)
    engine = queue.create_worker_engine(worker_settings(settings))
    _force(engine, run["id"], status="interrupted")
    _write_weights(settings, run["id"])

    assert _resume(client, other["project_id"], run["id"]).status_code == 404
    assert _resume(client, project_id, 9999).status_code == 404
    assert _resume(client, 9999, run["id"]).status_code == 404
    assert client.post(f"{_url(project_id, run['id'])}/resume").status_code == 403
    assert _row(engine, run["id"]).status == "interrupted"
    assert _row(engine, run["id"]).resume_count == 0


def test_a_checkpoint_the_worker_refused_is_not_offered_again(
    client: TestClient, settings: Settings
) -> None:
    project_id, (run,) = _queued_runs(client, 1, "Refused")
    engine = queue.create_worker_engine(worker_settings(settings))
    _force(engine, run["id"], status="failed", error_category="not_resumable", resume_epoch=1)
    _write_weights(settings, run["id"])

    detail = client.get(_url(project_id, run["id"])).json()
    response = _resume(client, project_id, run["id"])

    assert detail["can_resume"] is False
    assert response.status_code == 409
    assert response.json()["detail"] == CANNOT_RESUME
    assert _row(engine, run["id"]).status == "failed"


def test_a_failed_run_for_another_reason_can_be_resumed_and_loses_its_error(
    client: TestClient, settings: Settings
) -> None:
    project_id, (run,) = _queued_runs(client, 1, "FailedResume")
    engine = queue.create_worker_engine(worker_settings(settings))
    _force(
        engine,
        run["id"],
        status="failed",
        error_category="out_of_memory",
        error_message="CUDA out of memory.",
        log_tail="tail",
        resume_epoch=2,
    )
    _write_weights(settings, run["id"])

    response = _resume(client, project_id, run["id"])

    assert response.status_code == 200, response.text
    body = response.json()
    assert (body["status"], body["error_category"], body["error_message"]) == ("queued", None, None)
    assert body["log_tail"] is None
    assert body["resume_epoch"] == 2  # a stored value is kept


def test_the_run_list_carries_no_resumability_field(client: TestClient, settings: Settings) -> None:
    project_id, (run,) = _queued_runs(client, 1, "ListShape")
    engine = queue.create_worker_engine(worker_settings(settings))
    _force(engine, run["id"], status="interrupted")
    _write_weights(settings, run["id"])

    (listed,) = client.get(f"/api/projects/{project_id}/runs").json()

    assert "can_resume" not in listed
    assert listed["resume_count"] == 0
    assert listed["resume_epoch"] is None


def test_a_resumed_run_joins_the_end_of_the_queue(client: TestClient, settings: Settings) -> None:
    project_id, (old, newer) = _queued_runs(client, 2, "Fifo")
    engine = queue.create_worker_engine(worker_settings(settings))
    assert queue.claim_next(engine) == old["id"]
    assert queue.mark_cancelled(engine, old["id"], None) == 1
    _write_weights(settings, old["id"])

    response = _resume(client, project_id, old["id"])

    assert response.status_code == 200
    assert response.json()["queue_position"] == 2  # behind the run that was already waiting
    assert client.get(_url(project_id, newer["id"])).json()["queue_position"] == 1
    assert queue.claim_next(engine) == newer["id"]


# -- Phase 4 rows (D-10): no resume_epoch in the database, the events say where the run stopped --


def _phase4_run(
    client: TestClient,
    settings: Settings,
    *,
    saved: int | None = 2,
    final: bool = False,
    last: bool = True,
    db_epoch: int | None = None,
) -> tuple[int, int, Engine]:
    """An interrupted run as Phase 4 left it: events without `v`, `resume_epoch` NULL."""
    ids = setup_project(client, "Phase4", train=2, valid=1)
    run = start_run(client, ids["project_id"], epochs=5)
    wait_status(client, ids["project_id"], run["id"], {"queued"})
    engine = queue.create_worker_engine(worker_settings(settings))
    assert queue.claim_next(engine) == run["id"]
    if db_epoch is not None:
        queue.record_epoch(engine, run["id"], db_epoch, 5, None)
    assert queue.mark_interrupted(engine, run["id"], "The service was restarted.") == 1
    run_directory = layout.run_dir(settings.data_dir, run["id"])
    if last:
        _write_weights(settings, run["id"])
    if saved is not None:
        lines = []
        for epoch in range(1, saved + 1):
            lines.append({"event": "train_epoch_end", "epoch": epoch, "epochs": 5, "time": 1.0})
            lines.append({"event": "model_save", "epoch": epoch, "last": "l", "best": "b"})
            lines.append(
                {"event": "fit_epoch_end", "epoch": epoch, "epochs": 5, "final_validation": False}
            )
        if final:
            lines.append(
                {"event": "fit_epoch_end", "epoch": saved, "epochs": 5, "final_validation": True}
            )
        text = "\n".join(json.dumps(line) for line in lines) + "\n"
        (run_directory / layout.PROGRESS_FILE).write_text(text, encoding="utf-8")
    return ids["project_id"], run["id"], engine


def test_phase4_run_with_a_last_checkpoint_is_resumable_and_reports_its_derived_epoch(
    client: TestClient, settings: Settings
) -> None:
    project_id, run_id, engine = _phase4_run(client, settings, saved=2)
    assert _row(engine, run_id).resume_epoch is None

    detail = client.get(_url(project_id, run_id)).json()
    response = _resume(client, project_id, run_id)

    assert detail["can_resume"] is True
    assert detail["resume_epoch"] == 2  # derived from the model_save events, display only
    assert response.status_code == 200, response.text
    assert response.json()["status"] == "queued"
    assert _row(engine, run_id).resume_epoch == 2  # stored with the resume


def test_phase4_run_whose_events_show_the_loop_ended_is_refused(
    client: TestClient, settings: Settings
) -> None:
    project_id, run_id, engine = _phase4_run(client, settings, saved=2, final=True)

    detail = client.get(_url(project_id, run_id)).json()
    response = _resume(client, project_id, run_id)

    assert detail["can_resume"] is False
    assert detail["resume_epoch"] is None
    assert response.status_code == 409
    assert response.json()["detail"] == CANNOT_RESUME
    assert _row(engine, run_id).status == "interrupted"


def test_phase4_run_with_a_checkpoint_but_no_events_stays_resumable_without_a_guessed_epoch(
    client: TestClient, settings: Settings
) -> None:
    project_id, run_id, engine = _phase4_run(client, settings, saved=None, db_epoch=3)

    detail = client.get(_url(project_id, run_id)).json()
    response = _resume(client, project_id, run_id)

    assert detail["epoch"] == 3  # the database epoch is never offered as the resume point
    assert detail["can_resume"] is True
    assert detail["resume_epoch"] is None
    assert response.status_code == 200, response.text
    assert _row(engine, run_id).resume_epoch is None


def test_phase4_run_without_last_pt_is_the_only_no_checkpoint_case(
    client: TestClient, settings: Settings
) -> None:
    project_id, run_id, _ = _phase4_run(client, settings, saved=2, last=False)

    detail = client.get(_url(project_id, run_id)).json()
    response = _resume(client, project_id, run_id)

    assert detail["can_resume"] is False
    assert response.status_code == 409
    assert response.json()["detail"] == service.RUN_NO_CHECKPOINT_DETAIL


def test_phase4_run_resumes_and_the_resumed_train_start_records_the_epoch_really_loaded(
    client: TestClient, settings: Settings, monkeypatch: pytest.MonkeyPatch
) -> None:
    spawned = _Spawned()
    spawned.install(monkeypatch)
    project_id, run_id, engine = _phase4_run(client, settings, saved=2)
    assert _resume(client, project_id, run_id).status_code == 200
    assert _row(engine, run_id).resume_epoch == 2  # derived
    supervisor = Supervisor(
        engine,
        worker_settings(settings),
        ComputeDevice(cuda_available=False, device="cpu", device_name=None),
        command=fake_command("resume_hold"),
        tick_seconds=0.05,
    )
    assert queue.claim_next(engine) == run_id
    stop = threading.Event()
    thread, _ = _in_thread(lambda: supervisor.run_claimed(run_id, stop))

    # the fake resumed segment loads epoch 1: its train_start corrects the derived epoch
    _wait_until(lambda: _row(engine, run_id).resume_epoch == 1)
    stop.set()
    thread.join(timeout=15)

    assert not thread.is_alive()
    assert "--resume" in spawned.processes[-1].args
    assert _row(engine, run_id).status == "interrupted"


def test_phase4_run_resumes_to_completion(
    client: TestClient, settings: Settings, monkeypatch: pytest.MonkeyPatch
) -> None:
    project_id, run_id, engine = _phase4_run(client, settings, saved=2)
    assert _resume(client, project_id, run_id).status_code == 200
    supervisor = Supervisor(
        engine,
        worker_settings(settings),
        ComputeDevice(cuda_available=False, device="cpu", device_name=None),
        command=fake_command("success"),
        tick_seconds=0.05,
    )
    assert queue.claim_next(engine) == run_id

    assert supervisor.run_claimed(run_id, threading.Event()) == "completed"

    done = client.get(_url(project_id, run_id)).json()
    assert done["status"] == "completed"
    assert done["resume_epoch"] is None
    assert done["model"] is not None


# -- worker-side bookkeeping ----------------------------------------------------------------


class _WritingProcess:
    """A child that has exited; its first `poll()` appends events like the trainer would."""

    pid = 0
    returncode = 0

    def __init__(self, path, events: list[dict]) -> None:
        self._path = path
        self._events = events
        self._written = False

    def poll(self) -> int:
        if not self._written:
            self._written = True
            with self._path.open("a", encoding="utf-8") as handle:
                for event in self._events:
                    handle.write(json.dumps(event) + "\n")
        return 0


def _watching(client: TestClient, settings: Settings, name: str):
    ids = setup_project(client, name, train=2, valid=1)
    run = start_run(client, ids["project_id"], epochs=4)
    wait_status(client, ids["project_id"], run["id"], {"queued"})
    supervisor, engine = _supervisor(settings, "success")
    assert queue.claim_next(engine) == run["id"]
    return supervisor, engine, run["id"], layout.run_dir(settings.data_dir, run["id"])


def test_the_supervisor_follows_saves_the_end_of_the_loop_and_a_resumed_start(
    client: TestClient, settings: Settings
) -> None:
    supervisor, engine, run_id, run_directory = _watching(client, settings, "Bookkeeping")
    run = queue.load_run(engine, run_id)
    path = run_directory / layout.PROGRESS_FILE

    def watch(events: list[dict], *, resuming: bool = False) -> None:
        supervisor._watch(
            run_id, run, _WritingProcess(path, events), run_directory, threading.Event(), resuming
        )

    watch([{"event": "train_start", "epochs": 4, "start_epoch": 0, "resumed": False}])
    assert _row(engine, run_id).resume_epoch is None  # a fresh start records nothing
    watch([{"event": "model_save", "epoch": 1}, {"event": "model_save", "epoch": 2}])
    assert _row(engine, run_id).resume_epoch == 2
    watch([{"event": "model_save", "epoch": 4}])  # the last epoch's checkpoint is stripped
    assert _row(engine, run_id).resume_epoch == 2
    watch([{"event": "fit_epoch_end", "epoch": 3, "epochs": 4, "last_epoch": True, "metrics": {}}])
    assert _row(engine, run_id).resume_epoch is None  # the loop is over
    watch([{"event": "model_save", "epoch": 3}])  # a save after the end does not reopen it
    assert _row(engine, run_id).resume_epoch is None
    watch([{"event": "train_start", "epochs": 4, "start_epoch": 3, "resumed": True}], resuming=True)
    assert _row(engine, run_id).resume_epoch == 3


def test_a_resumed_segment_does_not_replay_the_events_of_earlier_segments(
    client: TestClient, settings: Settings
) -> None:
    supervisor, engine, run_id, run_directory = _watching(client, settings, "NoReplay")
    run = queue.load_run(engine, run_id)
    path = run_directory / layout.PROGRESS_FILE
    old = [
        {"event": "train_start", "epochs": 4, "start_epoch": 0, "resumed": False},
        {"event": "model_save", "epoch": 3},
        {"event": "fit_epoch_end", "epoch": 3, "epochs": 4, "metrics": {}, "last_epoch": False},
    ]
    path.write_text("".join(json.dumps(event) + "\n" for event in old), encoding="utf-8")

    supervisor._watch(
        run_id, run, _WritingProcess(path, []), run_directory, threading.Event(), True
    )

    row = _row(engine, run_id)
    assert row.resume_epoch is None
    assert row.epoch is None  # epoch 3 of the old segment was not written again


def test_the_claim_of_a_resumed_run_keeps_the_first_start_and_opens_a_new_segment(
    client: TestClient, settings: Settings
) -> None:
    project_id, (run,) = _queued_runs(client, 1, "Claim")
    engine = queue.create_worker_engine(worker_settings(settings))
    first = queue.claim_next(engine)
    assert first == run["id"]
    started = _row(engine, run["id"]).started_at
    assert started is not None
    queue.mark_interrupted(engine, run["id"], "stopped")
    _write_weights(settings, run["id"])
    assert _resume(client, project_id, run["id"]).status_code == 200
    # the claim itself clears the end of the previous attempt, whatever the resume left behind
    _force(engine, run["id"], finished_at=started, cancel_requested_at=started)

    assert queue.claim_next(engine) == run["id"]

    row = _row(engine, run["id"])
    assert row.status == "running"
    assert row.started_at == started
    assert row.segment_started_at is not None
    assert row.segment_started_at >= started
    assert row.finished_at is None
    assert row.cancel_requested_at is None
    loaded = queue.load_run(engine, run["id"])
    assert loaded["resume_count"] == 1
    assert loaded["active_seconds"] == 0


# -- active time across a cancel and a resume (D-09) ----------------------------------------------


def test_a_run_cancelled_and_resumed_counts_only_its_running_segments(
    client: TestClient, settings: Settings, monkeypatch: pytest.MonkeyPatch
) -> None:
    project_id, run_id, engine, _ = _cancelled_with_checkpoint(client, settings, monkeypatch)
    cancelled = _row(engine, run_id)
    first_start = cancelled.started_at
    assert cancelled.active_seconds > 0
    assert cancelled.segment_started_at is None  # the segment is closed
    after_cancel = cancelled.active_seconds
    assert _resume(client, project_id, run_id).status_code == 200
    queued = _row(engine, run_id)
    assert queued.active_seconds == after_cancel  # waiting in the queue is not training time
    assert queued.segment_started_at is None
    resuming = Supervisor(
        engine,
        worker_settings(settings),
        ComputeDevice(cuda_available=False, device="cpu", device_name=None),
        command=fake_command("success"),
        tick_seconds=0.05,
    )
    assert queue.claim_next(engine) == run_id
    assert _row(engine, run_id).segment_started_at is not None

    assert resuming.run_claimed(run_id, threading.Event()) == "completed"

    done = _row(engine, run_id)
    assert done.active_seconds > after_cancel
    assert done.segment_started_at is None
    assert done.started_at == first_start
    summary = client.get(_url(project_id, run_id)).json()
    assert summary["active_seconds"] == done.active_seconds
    assert summary["segment_started_at"] is None


# -- why a run cannot be resumed, in the read model of one run (D-10) ------------------------


def _fit_end(epoch: int, **extra: object) -> dict:
    return {
        "event": "fit_epoch_end",
        "epoch": epoch,
        "epochs": 5,
        "final_validation": False,
        **extra,
    }


def _write_events(settings: Settings, run_id: int, events: list[dict]) -> None:
    path = layout.run_dir(settings.data_dir, run_id) / layout.PROGRESS_FILE
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text("".join(json.dumps(event) + "\n" for event in events), encoding="utf-8")


def test_the_read_model_names_the_reason_a_run_cannot_be_resumed(
    client: TestClient, settings: Settings
) -> None:
    project_id, runs = _queued_runs(client, 6, "Blocked")
    engine = queue.create_worker_engine(worker_settings(settings))
    resumable, no_file, finished, refused, completed, queued = runs
    _force(engine, resumable["id"], status="cancelled", resume_epoch=3)
    _force(engine, no_file["id"], status="failed", error_category="out_of_memory")
    _force(engine, finished["id"], status="failed", epochs=5)
    _force(engine, refused["id"], status="failed", error_category="not_resumable", resume_epoch=1)
    _force(engine, completed["id"], status="completed")
    for run in (resumable, finished, refused):
        _write_weights(settings, run["id"])
    _write_events(settings, finished["id"], [_fit_end(5, last_epoch=True)])

    def blocked(run: dict) -> tuple[bool, str | None]:
        body = client.get(_url(project_id, run["id"])).json()
        return body["can_resume"], body["resume_blocked"]

    assert blocked(resumable) == (True, None)
    assert blocked(no_file) == (False, "no_checkpoint")
    assert blocked(finished) == (False, "finished")
    assert blocked(refused) == (False, "not_resumable")
    assert blocked(completed) == (False, None)
    assert blocked(queued) == (False, None)
    # deleting last.pt turns a resumable run into a no_checkpoint one
    layout.last_weights(layout.run_dir(settings.data_dir, resumable["id"])).unlink()
    assert blocked(resumable) == (False, "no_checkpoint")


def test_a_phase4_row_with_its_checkpoint_is_not_blocked_and_one_without_events_names_no_epoch(
    client: TestClient, settings: Settings
) -> None:
    project_id, run_id, _ = _phase4_run(client, settings, saved=4)
    detail = client.get(_url(project_id, run_id)).json()
    assert (detail["can_resume"], detail["resume_blocked"], detail["resume_epoch"]) == (
        True,
        None,
        4,
    )

    project_id, run_id, _ = _phase4_run(client, settings, saved=None, db_epoch=3)
    detail = client.get(_url(project_id, run_id)).json()
    assert (detail["can_resume"], detail["resume_blocked"], detail["resume_epoch"]) == (
        True,
        None,
        None,
    )


def test_the_run_list_carries_no_blocked_reason(client: TestClient, settings: Settings) -> None:
    project_id, (run,) = _queued_runs(client, 1, "ListBlocked")
    engine = queue.create_worker_engine(worker_settings(settings))
    _force(engine, run["id"], status="failed")

    (listed,) = client.get(f"/api/projects/{project_id}/runs").json()

    assert "resume_blocked" not in listed


# -- the device is checked again on a resume (D-11) -------------------------------------------


def test_a_gpu_run_is_not_resumed_on_a_host_without_a_gpu(
    client: TestClient, settings: Settings
) -> None:
    project_id, (run,) = _queued_runs(client, 1, "NoGpu")
    engine = queue.create_worker_engine(worker_settings(settings))
    _force(
        engine,
        run["id"],
        status="cancelled",
        resume_epoch=1,
        settings={"epochs": 5, "imgsz": 64, "batch": 2, "device": "0"},
    )
    _write_weights(settings, run["id"])

    response = _resume(client, project_id, run["id"])

    assert response.status_code == 422
    assert response.json()["detail"] == "No GPU is available."
    assert _row(engine, run["id"]).status == "cancelled"
    assert _row(engine, run["id"]).resume_count == 0

    write_heartbeat(settings)  # the worker reports CUDA now
    assert _resume(client, project_id, run["id"]).status_code == 200


def test_an_auto_or_cpu_run_needs_no_gpu_to_resume(client: TestClient, settings: Settings) -> None:
    project_id, (run,) = _queued_runs(client, 1, "CpuResume")
    engine = queue.create_worker_engine(worker_settings(settings))
    _force(engine, run["id"], status="cancelled", resume_epoch=1)
    _write_weights(settings, run["id"])

    assert _resume(client, project_id, run["id"]).status_code == 200
