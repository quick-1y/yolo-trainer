"""Shared helpers for the training tests: build a project, start a run, drive the worker.

Everything goes through the real api (TestClient over a temp-file SQLite database);
`fake_command` swaps the real `train_job` for `fake_train_job.py`.
"""

from __future__ import annotations

import io
import itertools
import sys
import time
import uuid
from pathlib import Path

from fastapi.testclient import TestClient
from PIL import Image, ImageDraw

from yolo_trainer_api.settings import Settings
from yolo_trainer_worker.main import WorkerSettings
from yolo_trainer_worker.supervisor import CommandBuilder, Resolved

XHR = {"X-Requested-With": "yolo-trainer"}
_counter = itertools.count(1)


def box_png(
    color: tuple[int, int, int],
    rect: tuple[int, int, int, int],
    size: tuple[int, int] = (96, 96),
) -> bytes:
    """A PNG with a filled rectangle; every call yields different bytes.

    The project rejects duplicate content, so a counter is encoded in the top-left pixels.
    """
    image = Image.new("RGB", size, (color[2], color[0], color[1]))
    draw = ImageDraw.Draw(image)
    draw.rectangle(rect, fill=color)
    number = next(_counter)
    for offset in range(8):
        bit = (number >> offset) & 1
        image.putpixel((offset, 0), (255 * bit, 255 * (1 - bit), 128))
    buffer = io.BytesIO()
    image.save(buffer, "PNG")
    return buffer.getvalue()


def _upload(client: TestClient, project_id: int, data: bytes) -> dict:
    response = client.post(
        f"/api/projects/{project_id}/images",
        files=[("files", (f"img-{next(_counter)}.png", data, "image/png"))],
        headers=XHR,
    )
    assert response.status_code == 200, response.text
    result = response.json()["results"][0]
    assert result["status"] == "added", result
    return result["image"]


def _put_boxes(
    client: TestClient, project_id: int, image_id: int, class_id: int | None, background: bool
) -> None:
    boxes = []
    if not background:
        boxes = [
            {
                "id": str(uuid.uuid4()),
                "class_id": class_id,
                "x": 0.25,
                "y": 0.25,
                "w": 0.5,
                "h": 0.5,
            }
        ]
    response = client.put(
        f"/api/projects/{project_id}/images/{image_id}/annotations",
        json={"base_version": 0, "is_background": background, "is_reviewed": False, "boxes": boxes},
        headers=XHR,
    )
    assert response.status_code == 200, response.text


def set_split(client: TestClient, project_id: int, ids: list[int], split: str | None):
    return client.post(
        f"/api/projects/{project_id}/images/split",
        json={"ids": ids, "split": split},
        headers=XHR,
    )


def setup_project(
    client: TestClient,
    name: str,
    task_type: str = "detect",
    train: int = 0,
    valid: int = 0,
    test: int = 0,
    background: int = 0,
    unannotated: int = 0,
    unassigned: int = 0,
    classes: tuple[str, ...] = ("box",),
) -> dict:
    """Create a project with classes and images; returns the ids by role.

    `train`, `valid` and `test` count annotated (one box) images of that split;
    `background` images and `unannotated` images are assigned to Train; `unassigned`
    images have no split and no annotation.
    """
    response = client.post("/api/projects", json={"name": name, "task_type": task_type})
    assert response.status_code == 201, response.text
    project_id = response.json()["id"]
    class_ids = []
    for class_name in classes:
        created = client.post(f"/api/projects/{project_id}/classes", json={"name": class_name})
        assert created.status_code == 201, created.text
        class_ids.append(created.json()["id"])

    roles: dict[str, list[int]] = {
        key: [] for key in ("train", "valid", "test", "background", "unannotated", "unassigned")
    }
    wanted = {
        "train": train,
        "valid": valid,
        "test": test,
        "background": background,
        "unannotated": unannotated,
        "unassigned": unassigned,
    }
    for role, count in wanted.items():
        for index in range(count):
            color = (40 + 30 * index, 200 - 20 * index, 90 + 10 * len(roles[role]))
            image = _upload(client, project_id, box_png(color, (24, 24, 72, 72)))
            roles[role].append(image["id"])
            if role in {"train", "valid", "test"}:
                _put_boxes(client, project_id, image["id"], class_ids[0], background=False)
            elif role == "background":
                _put_boxes(client, project_id, image["id"], None, background=True)
    for role, split in (
        ("train", "train"),
        ("valid", "valid"),
        ("test", "test"),
        ("background", "train"),
        ("unannotated", "train"),
    ):
        if roles[role]:
            assigned = set_split(client, project_id, roles[role], split)
            assert assigned.status_code == 200, assigned.text
    return {"project_id": project_id, "class_ids": class_ids, **roles}


def post_run(client: TestClient, project_id: int, **overrides: object):
    body: dict = {
        "name": None,
        "base": {"kind": "official", "name": "yolo26n"},
        "epochs": 2,
        "imgsz": 64,
        "batch": 2,
        "device": "cpu",
    }
    body.update(overrides)
    return client.post(f"/api/projects/{project_id}/runs", json=body, headers=XHR)


def start_run(client: TestClient, project_id: int, **overrides: object) -> dict:
    response = post_run(client, project_id, **overrides)
    assert response.status_code == 201, response.text
    return response.json()


def wait_status(
    client: TestClient,
    project_id: int,
    run_id: int,
    statuses: set[str] | tuple[str, ...],
    timeout: float = 5.0,
) -> dict:
    deadline = time.monotonic() + timeout
    while True:
        run = client.get(f"/api/projects/{project_id}/runs/{run_id}").json()
        if run["status"] in statuses:
            return run
        assert time.monotonic() < deadline, f"run stayed {run['status']}, wanted {statuses}"
        time.sleep(0.05)


def worker_settings(settings: Settings) -> WorkerSettings:
    return WorkerSettings(data_dir=settings.data_dir)


def fake_command(mode: str) -> CommandBuilder:
    script = Path(__file__).with_name("fake_train_job.py")

    def build(run_dir: Path, data_dir: Path, resolved: Resolved) -> list[str]:
        return [sys.executable, str(script), "--run-dir", str(run_dir), "--mode", mode]

    return build
