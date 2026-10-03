"""Seed a project with thousands of unique images through the real upload API.

This is the verification aid for the "browse smoothly at thousands of images"
success criterion: it fills a project via `POST /api/projects/{id}/images`
(multipart batches, the same path the browser uses), so the whole pipeline
(validation, dedup, thumbnails, database) is exercised exactly as in real use.

Run it against a running stack:

    uv run python scripts/seed_images.py --count 5000
    uv run python scripts/seed_images.py --count 5000 --project-id 3

Running it twice with the same arguments reports every image as a duplicate
(the images are deterministic per index and seed).

Dependencies: httpx (dev group) and Pillow only.
"""

from __future__ import annotations

import argparse
import io
import random
import sys
import time
from concurrent.futures import ThreadPoolExecutor

import httpx
from PIL import Image, ImageDraw

IMAGE_SIZE = (640, 480)
JPEG_QUALITY = 85
XHR_HEADERS = {"X-Requested-With": "yolo-trainer"}
REQUEST_TIMEOUT_SECONDS = 120.0


def make_unique_jpeg(i: int, seed: int = 0) -> bytes:
    """Return a 640x480 JPEG that is unique per (i, seed) and reproducible."""
    rng = random.Random(seed * 1_000_003 + i)
    width, height = IMAGE_SIZE
    image = Image.new("RGB", IMAGE_SIZE, tuple(rng.randrange(256) for _ in range(3)))
    draw = ImageDraw.Draw(image)
    for _ in range(3):
        x0 = rng.randrange(width - 40)
        y0 = rng.randrange(height - 40)
        x1 = rng.randrange(x0 + 20, width)
        y1 = rng.randrange(y0 + 20, height)
        draw.rectangle(
            (x0, y0, x1, y1), fill=tuple(rng.randrange(256) for _ in range(3))
        )
    # The counter makes uniqueness independent of the random draws above.
    draw.text((16, 16), f"#{i} seed={seed}", fill=(255, 255, 255))
    buffer = io.BytesIO()
    image.save(buffer, "JPEG", quality=JPEG_QUALITY)
    return buffer.getvalue()


def resolve_project(client: httpx.Client, project_id: int | None, name: str) -> int:
    """Return the id of the target project, creating a detect project if needed."""
    if project_id is not None:
        response = client.get(f"/api/projects/{project_id}")
        if response.status_code != 200:
            raise RuntimeError(
                f"project {project_id} not found (HTTP {response.status_code})"
            )
        return project_id

    response = client.post("/api/projects", json={"name": name, "task_type": "detect"})
    if response.status_code == 201:
        return int(response.json()["id"])
    if response.status_code != 409:
        raise RuntimeError(
            f"creating project {name!r} failed: HTTP {response.status_code}"
        )

    # The name is taken: the seed project already exists, so reuse it.
    listing = client.get("/api/projects")
    listing.raise_for_status()
    wanted = name.strip().casefold()
    for project in listing.json():
        if str(project["name"]).strip().casefold() == wanted:
            return int(project["id"])
    raise RuntimeError(
        f"project name {name!r} conflicts but no such project was listed"
    )


def _upload_batch(
    client: httpx.Client, project_id: int, indices: list[int], seed: int
) -> dict[str, int]:
    files = [
        ("files", (f"seed_{i:05d}.jpg", make_unique_jpeg(i, seed), "image/jpeg"))
        for i in indices
    ]
    response = client.post(
        f"/api/projects/{project_id}/images",
        files=files,
        headers=XHR_HEADERS,
    )
    if response.status_code != 200:
        raise RuntimeError(
            f"upload batch starting at {indices[0]} failed: HTTP {response.status_code} "
            f"{response.text[:200]}"
        )
    counts = {"added": 0, "duplicate": 0, "rejected": 0}
    for result in response.json()["results"]:
        counts[result["status"]] += 1
    return counts


def seed(
    client: httpx.Client,
    project_id: int,
    count: int,
    *,
    batch_size: int = 20,
    workers: int = 4,
    seed: int = 0,
) -> dict[str, int]:
    """Upload `count` generated images in batches and sum the per-file statuses."""
    batches = [
        list(range(start, min(start + batch_size, count)))
        for start in range(0, count, batch_size)
    ]
    totals = {"added": 0, "duplicate": 0, "rejected": 0}
    with ThreadPoolExecutor(max_workers=workers) as pool:
        futures = [
            pool.submit(_upload_batch, client, project_id, indices, seed)
            for indices in batches
        ]
        for future in futures:
            for status, number in future.result().items():
                totals[status] += number
    return totals


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description=__doc__.split("\n\n")[0])
    parser.add_argument("--base-url", default="http://127.0.0.1:8080")
    parser.add_argument("--count", type=int, default=5000)
    parser.add_argument("--project-id", type=int, default=None)
    parser.add_argument("--name", default="seed-5000")
    parser.add_argument("--batch-size", type=int, default=20)
    parser.add_argument("--workers", type=int, default=4)
    parser.add_argument("--seed", type=int, default=0)
    args = parser.parse_args(argv)

    started = time.perf_counter()
    try:
        with httpx.Client(
            base_url=args.base_url, timeout=REQUEST_TIMEOUT_SECONDS
        ) as client:
            project_id = resolve_project(client, args.project_id, args.name)
            totals = seed(
                client,
                project_id,
                args.count,
                batch_size=args.batch_size,
                workers=args.workers,
                seed=args.seed,
            )
    except (httpx.HTTPError, RuntimeError) as error:
        print(f"seeding failed: {error}", file=sys.stderr)
        return 2

    elapsed = time.perf_counter() - started
    print(
        f"project={project_id} added={totals['added']} duplicate={totals['duplicate']} "
        f"rejected={totals['rejected']} elapsed={elapsed:.1f}s"
    )
    return 1 if totals["rejected"] else 0


if __name__ == "__main__":
    raise SystemExit(main())
