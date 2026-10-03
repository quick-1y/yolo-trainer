"""Keyset paging, filename search and cursor validation of the image list API (ANNO-01).

Rows are bulk-inserted straight into the migrated SQLite file - listing needs
no files on disk - so the walks run over thousands of rows in well under a
second. Everything else (app, migrations, routing, serialization) is real.
"""

from __future__ import annotations

import base64
import json
import sqlite3
from collections.abc import Iterator

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import create_engine, insert
from sqlalchemy.dialects import sqlite as sqlite_dialect

from yolo_trainer_api.models import Image, normalize_project_name
from yolo_trainer_api.routers.images import Cursor, build_page_query
from yolo_trainer_api.settings import Settings

from .conftest import make_client

XHR = {"X-Requested-With": "yolo-trainer"}
TOTAL = 5000
OTHER_TOTAL = 50
PAGE = 500


def _create_project(client: TestClient, name: str) -> int:
    response = client.post("/api/projects", json={"name": name, "task_type": "detect"})
    assert response.status_code == 201
    return response.json()["id"]


def _row(project_id: int, serial: int, filename: str) -> dict:
    return {
        "project_id": project_id,
        "original_filename": filename,
        "filename_key": normalize_project_name(filename),
        "ext": "jpg",
        "sha256": f"{project_id:08x}{serial:056x}",
        "size_bytes": 1000,
        "width": 64,
        "height": 48,
    }


def _insert_rows(settings: Settings, rows: list[dict]) -> None:
    engine = create_engine(settings.sync_database_url)
    try:
        with engine.begin() as connection:
            connection.execute(insert(Image), rows)
    finally:
        engine.dispose()


def _walk(client: TestClient, project_id: int, **params) -> tuple[list[dict], int, int]:
    """Follow next_cursor to the end; return (items, total of first page, pages)."""
    items: list[dict] = []
    cursor: str | None = None
    first_total: int | None = None
    pages = 0
    while True:
        query = {"limit": PAGE, **params}
        if cursor is not None:
            query["cursor"] = cursor
        response = client.get(f"/api/projects/{project_id}/images", params=query)
        assert response.status_code == 200, response.text
        body = response.json()
        pages += 1
        first_total = body["total"] if first_total is None else first_total
        assert body["total"] == first_total
        items.extend(body["items"])
        cursor = body["next_cursor"]
        if cursor is None:
            return items, first_total, pages
        assert pages < 100, "cursor walk did not terminate"


def _forge_cursor(payload: object) -> str:
    raw = json.dumps(payload, separators=(",", ":")).encode("utf-8")
    return base64.urlsafe_b64encode(raw).rstrip(b"=").decode("ascii")


@pytest.fixture
def seeded(settings: Settings) -> Iterator[tuple[TestClient, int, int]]:
    """Client plus (project_id, other_project_id) with 5000 + 50 rows."""
    with make_client(settings) as client:
        project_id = _create_project(client, "Big")
        other_id = _create_project(client, "Other")
        prefixes = ["Car", "CAR", "truck", "Plane", "bicarbonate", "Zebra", "apple"]
        rows = [
            _row(project_id, i, f"{prefixes[i % len(prefixes)]}-{i % 211:03d}.jpg")
            for i in range(TOTAL - 10)
        ]
        rows += [_row(project_id, TOTAL - 10 + i, "same.jpg") for i in range(10)]
        _insert_rows(settings, rows)
        _insert_rows(
            settings, [_row(other_id, i, f"car-other-{i}.jpg") for i in range(OTHER_TOTAL)]
        )
        yield client, project_id, other_id


class TestKeysetWalks:
    def test_newest_walk_returns_all_5000_once_in_descending_order(self, seeded) -> None:
        client, project_id, other_id = seeded

        items, total, pages = _walk(client, project_id, sort="newest")

        ids = [item["id"] for item in items]
        assert total == TOTAL
        assert len(ids) == TOTAL == len(set(ids))
        assert ids == sorted(ids, reverse=True)
        assert pages == TOTAL // PAGE
        other_ids = {item["id"] for item in _walk(client, other_id, sort="newest")[0]}
        assert len(other_ids) == OTHER_TOTAL
        assert other_ids.isdisjoint(ids)

    def test_newest_is_the_default_sort(self, seeded) -> None:
        client, project_id, _ = seeded

        default = client.get(f"/api/projects/{project_id}/images", params={"limit": 20}).json()
        explicit = client.get(
            f"/api/projects/{project_id}/images", params={"limit": 20, "sort": "newest"}
        ).json()

        assert default == explicit

    def test_last_page_has_no_next_cursor(self, seeded) -> None:
        client, project_id, _ = seeded
        cursor = None
        last: dict = {}
        for _ in range(TOTAL // PAGE):
            params = {"limit": PAGE, "sort": "newest"}
            if cursor:
                params["cursor"] = cursor
            last = client.get(f"/api/projects/{project_id}/images", params=params).json()
            cursor = last["next_cursor"]

        assert len(last["items"]) == PAGE
        assert last["next_cursor"] is None

    def test_name_walk_is_ordered_by_filename_key_then_id_without_gaps(self, seeded) -> None:
        client, project_id, _ = seeded

        items, total, _ = _walk(client, project_id, sort="name")

        ids = [item["id"] for item in items]
        assert total == TOTAL
        assert len(ids) == TOTAL == len(set(ids))
        keys = [(normalize_project_name(item["filename"]), item["id"]) for item in items]
        assert keys == sorted(keys)
        same = [item["id"] for item in items if item["filename"] == "same.jpg"]
        assert len(same) == 10
        assert same == sorted(same)

    def test_name_walk_across_ties_never_drops_or_repeats(self, seeded) -> None:
        client, project_id, _ = seeded

        # A page size of 3 puts several page boundaries inside the 10 same.jpg rows.
        seen: list[int] = []
        cursor = None
        while True:
            params = {"limit": 3, "sort": "name", "q": "same"}
            if cursor:
                params["cursor"] = cursor
            body = client.get(f"/api/projects/{project_id}/images", params=params).json()
            seen.extend(item["id"] for item in body["items"])
            cursor = body["next_cursor"]
            if cursor is None:
                break

        assert len(seen) == 10 == len(set(seen))
        assert seen == sorted(seen)


class TestSearch:
    def test_search_is_case_insensitive_and_total_matches(self, seeded) -> None:
        client, project_id, _ = seeded
        expected = sum(1 for i in range(TOTAL - 10) if i % 7 in (0, 1, 4))  # Car, CAR, bicarbonate

        items, total, _ = _walk(client, project_id, q="CAR")

        assert total == expected == len(items)
        assert all("car" in item["filename"].lower() for item in items)
        assert len({item["id"] for item in items}) == expected

    def test_search_works_with_name_sort_and_never_leaks_other_projects(self, seeded) -> None:
        client, project_id, _ = seeded

        items, total, _ = _walk(client, project_id, q="car", sort="name")

        assert total == len(items)
        assert all("other" not in item["filename"] for item in items)
        keys = [(normalize_project_name(item["filename"]), item["id"]) for item in items]
        assert keys == sorted(keys)

    def test_search_with_no_match_is_an_empty_page(self, seeded) -> None:
        client, project_id, _ = seeded

        body = client.get(f"/api/projects/{project_id}/images", params={"q": "no-such-file"}).json()

        assert body == {"items": [], "next_cursor": None, "total": 0}

    def test_blank_search_is_the_unfiltered_list(self, seeded) -> None:
        client, project_id, _ = seeded

        body = client.get(f"/api/projects/{project_id}/images", params={"q": "   "}).json()

        assert body["total"] == TOTAL

    def test_like_wildcards_are_literal(self, settings: Settings) -> None:
        with make_client(settings) as client:
            project_id = _create_project(client, "Wild")
            _insert_rows(
                settings,
                [
                    _row(project_id, 1, "100%_done.jpg"),
                    _row(project_id, 2, "100ab_done.jpg"),
                    _row(project_id, 3, "plain.jpg"),
                ],
            )

            percent_underscore = client.get(
                f"/api/projects/{project_id}/images", params={"q": "%_"}
            ).json()
            only_percent = client.get(
                f"/api/projects/{project_id}/images", params={"q": "%"}
            ).json()
            only_underscore = client.get(
                f"/api/projects/{project_id}/images", params={"q": "_done"}
            ).json()

        assert [item["filename"] for item in percent_underscore["items"]] == ["100%_done.jpg"]
        assert percent_underscore["total"] == 1
        assert [item["filename"] for item in only_percent["items"]] == ["100%_done.jpg"]
        assert {item["filename"] for item in only_underscore["items"]} == {
            "100%_done.jpg",
            "100ab_done.jpg",
        }

    def test_sql_metacharacters_in_q_are_inert(self, settings: Settings) -> None:
        with make_client(settings) as client:
            project_id = _create_project(client, "Inject")
            _insert_rows(settings, [_row(project_id, 1, "a.jpg")])

            response = client.get(f"/api/projects/{project_id}/images", params={"q": "' OR 1=1 --"})

        assert response.status_code == 200
        assert response.json()["total"] == 0


class TestValidation:
    def _url(self, project_id: int) -> str:
        return f"/api/projects/{project_id}/images"

    def test_newest_cursor_is_rejected_for_name_sort(self, seeded) -> None:
        client, project_id, _ = seeded
        newest = client.get(self._url(project_id), params={"limit": 5}).json()

        response = client.get(
            self._url(project_id),
            params={"sort": "name", "cursor": newest["next_cursor"]},
        )

        assert response.status_code == 422
        assert response.json()["detail"] == "Invalid cursor."

    def test_name_cursor_is_rejected_for_newest_sort(self, seeded) -> None:
        client, project_id, _ = seeded
        by_name = client.get(self._url(project_id), params={"limit": 5, "sort": "name"}).json()

        response = client.get(
            self._url(project_id),
            params={"sort": "newest", "cursor": by_name["next_cursor"]},
        )

        assert response.status_code == 422
        assert response.json()["detail"] == "Invalid cursor."

    @pytest.mark.parametrize(
        "cursor",
        [
            "!!!",
            "e30",  # {} - no fields
            _forge_cursor([1, 2]),
            _forge_cursor({"s": "newest", "k": None, "i": "5"}),
            _forge_cursor({"s": "newest", "k": None, "i": True}),
            _forge_cursor({"s": "newest", "k": None, "i": 0}),
            _forge_cursor({"s": "newest", "k": 7, "i": 5}),
        ],
    )
    def test_malformed_cursors_are_rejected(self, seeded, cursor: str) -> None:
        client, project_id, _ = seeded

        response = client.get(self._url(project_id), params={"cursor": cursor})

        assert response.status_code == 422
        assert response.json()["detail"] == "Invalid cursor."

    @pytest.mark.parametrize(
        "cursor",
        [
            _forge_cursor({"s": "name", "k": None, "i": 5}),
            _forge_cursor({"s": "name", "k": 12, "i": 5}),
            _forge_cursor({"s": "name", "k": "abc", "i": "5"}),
        ],
    )
    def test_name_cursor_needs_a_string_key_and_int_id(self, seeded, cursor: str) -> None:
        client, project_id, _ = seeded

        response = client.get(self._url(project_id), params={"sort": "name", "cursor": cursor})

        assert response.status_code == 422
        assert response.json()["detail"] == "Invalid cursor."

    @pytest.mark.parametrize("limit", [0, 501, -1])
    def test_limit_outside_range_is_422(self, seeded, limit: int) -> None:
        client, project_id, _ = seeded

        assert client.get(self._url(project_id), params={"limit": limit}).status_code == 422

    def test_limit_bounds_are_accepted(self, seeded) -> None:
        client, project_id, _ = seeded

        assert client.get(self._url(project_id), params={"limit": 1}).status_code == 200
        assert client.get(self._url(project_id), params={"limit": 500}).status_code == 200

    def test_q_longer_than_255_characters_is_422(self, seeded) -> None:
        client, project_id, _ = seeded

        assert client.get(self._url(project_id), params={"q": "a" * 255}).status_code == 200
        assert client.get(self._url(project_id), params={"q": "a" * 256}).status_code == 422

    def test_unknown_sort_is_422(self, seeded) -> None:
        client, project_id, _ = seeded

        assert client.get(self._url(project_id), params={"sort": "oldest"}).status_code == 422

    def test_missing_project_is_404(self, seeded) -> None:
        client, _, _ = seeded

        assert client.get(self._url(999_999), params={"sort": "name", "q": "x"}).status_code == 404


class TestIndexUsage:
    def _plan(self, settings: Settings, project_id: int, sort: str, cursor: Cursor | None) -> str:
        stmt = build_page_query(project_id, sort, "", cursor, 100)
        sql = str(
            stmt.compile(dialect=sqlite_dialect.dialect(), compile_kwargs={"literal_binds": True})
        )
        connection = sqlite3.connect(settings.db_path)
        try:
            rows = connection.execute(f"EXPLAIN QUERY PLAN {sql}").fetchall()
        finally:
            connection.close()
        return " | ".join(str(row[3]) for row in rows)

    def test_newest_query_uses_the_project_id_index(self, seeded, settings: Settings) -> None:
        _, project_id, _ = seeded

        first = self._plan(settings, project_id, "newest", None)
        later = self._plan(settings, project_id, "newest", Cursor("newest", None, 2500))

        assert "ix_images_project_id_id" in first, first
        assert "ix_images_project_id_id" in later, later

    def test_name_query_uses_the_filename_key_index(self, seeded, settings: Settings) -> None:
        _, project_id, _ = seeded

        first = self._plan(settings, project_id, "name", None)
        later = self._plan(settings, project_id, "name", Cursor("name", "car-100.jpg", 2500))

        assert "ix_images_project_filename_key" in first, first
        assert "ix_images_project_filename_key" in later, later
        assert "TEMP B-TREE" not in first, first
        assert "TEMP B-TREE" not in later, later
