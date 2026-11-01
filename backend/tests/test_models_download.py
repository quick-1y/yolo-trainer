"""The `.pt` download contract (MODL-04, D-18).

Models are registered by the real worker queue and supervisor with the fake trainer,
so the files on disk are exactly what a finished run leaves behind. The tests pin the
headers and the file name for any project and run name (T4-07-03).
"""

from __future__ import annotations

import re
import threading
from urllib.parse import quote, unquote

from fastapi.testclient import TestClient

from yolo_trainer_api.settings import Settings
from yolo_trainer_common import layout
from yolo_trainer_common.device import ComputeDevice
from yolo_trainer_worker import queue
from yolo_trainer_worker.supervisor import Supervisor

from .fake_train_job import BEST_BYTES
from .training_helpers import (
    fake_command,
    setup_project,
    start_run,
    wait_status,
    worker_settings,
)


def _train_model(
    client: TestClient, settings: Settings, project_name: str, run_name: str | None
) -> int:
    """Train one run to the end with the fake trainer and return its model id."""
    ids = setup_project(client, project_name, train=1, valid=1)
    run = start_run(client, ids["project_id"], name=run_name)
    wait_status(client, ids["project_id"], run["id"], {"queued"})
    engine = queue.create_worker_engine(worker_settings(settings))
    assert queue.claim_next(engine) == run["id"]
    Supervisor(
        engine,
        worker_settings(settings),
        ComputeDevice(cuda_available=False, device="cpu", device_name=None),
        command=fake_command("success"),
        tick_seconds=0.05,
    ).run_claimed(run["id"], threading.Event())
    finished = wait_status(client, ids["project_id"], run["id"], {"completed"})
    return finished["model"]["id"]


def _filename(disposition: str) -> str:
    """The file name a browser would save: `filename*` (UTF-8) wins over `filename`."""
    encoded = re.search(r"filename\*=utf-8''([^;]+)", disposition, re.IGNORECASE)
    if encoded:
        return unquote(encoded.group(1))
    plain = re.search(r'filename="([^"]*)"', disposition)
    assert plain, disposition
    return plain.group(1)


def test_a_model_downloads_as_an_attachment_named_after_project_and_run(
    client: TestClient, settings: Settings
) -> None:
    model_id = _train_model(client, settings, "Plates", "run-3")

    response = client.get(f"/api/models/{model_id}/download")

    assert response.status_code == 200
    assert response.headers["content-type"] == "application/octet-stream"
    disposition = response.headers["content-disposition"]
    assert disposition.startswith("attachment")
    assert 'filename="Plates_run-3_best.pt"' in disposition
    assert response.content == BEST_BYTES
    assert response.content == layout.model_file(settings.data_dir, model_id).read_bytes()


def test_cyrillic_names_are_kept_and_sent_as_utf8_filename_star(
    client: TestClient, settings: Settings
) -> None:
    model_id = _train_model(client, settings, "Номера / тест", "run 1")

    response = client.get(f"/api/models/{model_id}/download")

    assert response.status_code == 200
    disposition = response.headers["content-disposition"]
    assert "filename*=utf-8''" + quote("Номера___тест_run_1_best.pt") in disposition
    assert _filename(disposition) == "Номера___тест_run_1_best.pt"


def test_leading_dots_in_the_project_name_are_stripped(
    client: TestClient, settings: Settings
) -> None:
    model_id = _train_model(client, settings, "..hidden", "run-1")

    disposition = client.get(f"/api/models/{model_id}/download").headers["content-disposition"]

    name = _filename(disposition)
    assert name == "hidden_run-1_best.pt"
    assert not name.startswith(".")


def test_unsafe_characters_never_reach_the_header_or_the_path(
    client: TestClient, settings: Settings
) -> None:
    model_id = _train_model(client, settings, '../x"y;z', "a\\b")

    response = client.get(f"/api/models/{model_id}/download")

    assert response.status_code == 200
    name = _filename(response.headers["content-disposition"])
    assert name == "_x_y_z_a_b_best.pt"
    assert not set(name) & set('/\\";:')
    assert response.content == BEST_BYTES


def test_a_long_project_and_run_name_is_cut_to_120_characters(
    client: TestClient, settings: Settings
) -> None:
    model_id = _train_model(client, settings, "p" * 100, "r" * 100)

    disposition = client.get(f"/api/models/{model_id}/download").headers["content-disposition"]

    name = _filename(disposition)
    assert len(name) <= 120
    assert name.endswith("_best.pt")
    assert name.startswith("pppp")


def test_an_unknown_model_answers_404(client: TestClient) -> None:
    response = client.get("/api/models/9999/download")

    assert response.status_code == 404
    assert response.json()["detail"] == "Model not found."


def test_a_model_whose_file_is_gone_answers_404(client: TestClient, settings: Settings) -> None:
    model_id = _train_model(client, settings, "Gone", "run-1")
    layout.model_file(settings.data_dir, model_id).unlink()

    response = client.get(f"/api/models/{model_id}/download")

    assert response.status_code == 404
    assert response.json()["detail"] == "Model not found."
