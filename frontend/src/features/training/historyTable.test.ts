import { describe, expect, it } from "vitest";

import type { RunStatus, RunSummary } from "../../api/training";
import {
  filterRuns,
  firstDirection,
  formatKeySettings,
  historyMetric,
  historyParams,
  parseHistoryParams,
  sortRuns,
  STATUS_ORDER,
} from "./historyTable";
import type { HistorySort } from "./historyTable";

const NOW = Date.parse("2026-01-15T12:00:00Z");

function run(overrides: Partial<RunSummary> = {}): RunSummary {
  return {
    id: 1,
    project_id: 1,
    name: "run-1",
    status: "completed",
    queue_position: null,
    task_type: "detect",
    base_kind: "official",
    base_name: "yolo26n",
    epoch: null,
    epochs: 100,
    last_map50: null,
    map50: null,
    created_at: "2026-01-15T10:00:00Z",
    started_at: null,
    finished_at: null,
    model: null,
    error_category: null,
    cancelling: false,
    resume_count: 0,
    resume_epoch: null,
    active_seconds: 0,
    segment_started_at: null,
    quality: null,
    map50_95: null,
    last_map50_95: null,
    image_count: null,
    settings: { epochs: 100, imgsz: 640, batch: -1, device: "auto" },
    resolved: null,
    ...overrides,
  };
}

function ids(runs: RunSummary[]): number[] {
  return runs.map((item) => item.id);
}

// `t` stub: the fallback label is all the helpers ask for.
const t = (key: string): string => (key === "training:settings.autoPending" ? "Auto" : key);

describe("parseHistoryParams", () => {
  it("falls back to Created descending and all statuses without parameters", () => {
    expect(parseHistoryParams(new URLSearchParams())).toEqual({
      sort: "created",
      dir: "desc",
      status: "all",
    });
  });

  it("reads allow-listed values as given", () => {
    const params = new URLSearchParams("sort=map5095&dir=asc&status=failed");
    expect(parseHistoryParams(params)).toEqual({ sort: "map5095", dir: "asc", status: "failed" });
  });

  it("falls back to the defaults for unknown or malformed values", () => {
    const params = new URLSearchParams("sort=bogus&dir=up&status=nope");
    expect(parseHistoryParams(params)).toEqual({ sort: "created", dir: "desc", status: "all" });
    expect(parseHistoryParams(new URLSearchParams("sort=__proto__&status=<img>"))).toEqual({
      sort: "created",
      dir: "desc",
      status: "all",
    });
  });
});

describe("historyParams", () => {
  it("omits the defaults and writes only what differs", () => {
    expect(historyParams({ sort: "created", dir: "desc", status: "all" }).toString()).toBe("");
    expect(historyParams({ sort: "name", dir: "asc", status: "all" }).toString()).toBe(
      "sort=name&dir=asc",
    );
    expect(historyParams({ sort: "created", dir: "asc", status: "failed" }).toString()).toBe(
      "dir=asc&status=failed",
    );
  });

  it("round-trips through parseHistoryParams", () => {
    const state = { sort: "images", dir: "desc", status: "running" } as const;
    expect(parseHistoryParams(historyParams(state))).toEqual(state);
  });
});

describe("firstDirection", () => {
  it("sorts text columns ascending first and numeric and date columns descending first", () => {
    const text: HistorySort[] = ["name", "base", "status"];
    const numeric: HistorySort[] = ["created", "duration", "epochs", "map50", "map5095", "images"];
    expect(text.map(firstDirection)).toEqual(["asc", "asc", "asc"]);
    expect(numeric.map(firstDirection)).toEqual(Array(6).fill("desc"));
  });
});

describe("sortRuns", () => {
  const runs = [
    run({ id: 1, map50_95: 0.3, last_map50_95: 0.3 }),
    run({ id: 2, map50_95: null }),
    run({ id: 3, map50_95: 0.5 }),
  ];

  it("puts missing values last, descending and ascending", () => {
    expect(ids(sortRuns(runs, "map5095", "desc", NOW))).toEqual([3, 1, 2]);
    expect(ids(sortRuns(runs, "map5095", "asc", NOW))).toEqual([1, 3, 2]);
  });

  it("does not mutate the list it is given", () => {
    const before = ids(runs);
    sortRuns(runs, "map5095", "desc", NOW);
    expect(ids(runs)).toEqual(before);
  });

  it("breaks ties by run id descending in both directions", () => {
    const tied = [run({ id: 4, base_name: "a" }), run({ id: 9, base_name: "a" }), run({ id: 6, base_name: "a" })];
    expect(ids(sortRuns(tied, "base", "asc", NOW))).toEqual([9, 6, 4]);
    expect(ids(sortRuns(tied, "base", "desc", NOW))).toEqual([9, 6, 4]);
  });

  it("orders statuses by the fixed order, not alphabetically", () => {
    expect(STATUS_ORDER).toEqual([
      "running",
      "preparing",
      "queued",
      "interrupted",
      "failed",
      "cancelled",
      "completed",
    ]);
    const statuses: RunStatus[] = ["completed", "queued", "failed", "running", "cancelled", "interrupted", "preparing"];
    const mixed = statuses.map((status, index) => run({ id: index + 1, status }));
    expect(sortRuns(mixed, "status", "asc", NOW).map((item) => item.status)).toEqual([...STATUS_ORDER]);
    expect(sortRuns(mixed, "status", "desc", NOW).map((item) => item.status)).toEqual([...STATUS_ORDER].reverse());
  });

  it("sorts the duration by active time, live segment included", () => {
    const set = [
      run({ id: 1, status: "completed", active_seconds: 600, started_at: "2026-01-15T09:00:00Z" }),
      run({
        id: 2,
        status: "running",
        active_seconds: 100,
        segment_started_at: "2026-01-15T11:00:00Z",
        started_at: "2026-01-15T09:00:00Z",
      }),
      run({ id: 3, status: "queued" }),
    ];
    // the running one has 100 s banked plus an hour of live segment; the queued one never started
    expect(ids(sortRuns(set, "duration", "desc", NOW))).toEqual([2, 1, 3]);
    expect(ids(sortRuns(set, "duration", "asc", NOW))).toEqual([1, 2, 3]);
  });

  it("sorts names naturally and without regard to case", () => {
    const named = [run({ id: 1, name: "run-10" }), run({ id: 2, name: "Run-2" }), run({ id: 3, name: "run-1" })];
    expect(sortRuns(named, "name", "asc", NOW).map((item) => item.name)).toEqual(["run-1", "Run-2", "run-10"]);
  });

  it("sorts mAP50 by the final value, else the last epoch's", () => {
    const set = [
      run({ id: 1, map50: 0.7 }),
      run({ id: 2, map50: null, last_map50: 0.9, status: "cancelled" }),
      run({ id: 3, map50: null, last_map50: null }),
    ];
    expect(ids(sortRuns(set, "map50", "desc", NOW))).toEqual([2, 1, 3]);
  });

  it("sorts by images, created and epochs", () => {
    const set = [
      run({ id: 1, image_count: 10, epoch: 5, created_at: "2026-01-15T08:00:00Z" }),
      run({ id: 2, image_count: null, epoch: null, created_at: "2026-01-15T09:00:00Z" }),
      run({ id: 3, image_count: 30, epoch: 50, created_at: "2026-01-15T07:00:00Z" }),
    ];
    expect(ids(sortRuns(set, "images", "desc", NOW))).toEqual([3, 1, 2]);
    expect(ids(sortRuns(set, "epochs", "asc", NOW))).toEqual([1, 3, 2]);
    expect(ids(sortRuns(set, "created", "desc", NOW))).toEqual([2, 1, 3]);
  });
});

describe("filterRuns", () => {
  const runs = [run({ id: 1, status: "failed" }), run({ id: 2, status: "completed" }), run({ id: 3, status: "failed" })];

  it("keeps every run for all statuses and only the matching ones otherwise", () => {
    expect(ids(filterRuns(runs, "all"))).toEqual([1, 2, 3]);
    expect(ids(filterRuns(runs, "failed"))).toEqual([1, 3]);
    expect(filterRuns(runs, "running")).toEqual([]);
  });
});

describe("formatKeySettings", () => {
  it("shows the resolved batch and device of an auto request once known", () => {
    const resolved = { device: "cpu", batch: 16, workers: 0 };
    expect(formatKeySettings(run({ resolved }), t)).toBe("640 · 16 · CPU");
    expect(formatKeySettings(run({ resolved: { ...resolved, device: "0" } }), t)).toBe("640 · 16 · GPU 0");
  });

  it("shows Auto while the worker has not resolved the request", () => {
    expect(formatKeySettings(run(), t)).toBe("640 · Auto · Auto");
  });

  it("shows explicit choices as they are", () => {
    const explicit = { epochs: 10, imgsz: 320, batch: 8, device: "cpu" } as const;
    expect(formatKeySettings(run({ settings: explicit }), t)).toBe("320 · 8 · CPU");
    expect(formatKeySettings(run({ settings: { ...explicit, device: "0" } }), t)).toBe("320 · 8 · GPU 0");
  });
});

describe("historyMetric", () => {
  it("returns the final value unflagged", () => {
    expect(historyMetric(run({ map50: 0.8, map50_95: 0.5 }), "map50")).toEqual({ value: 0.8, lastEpoch: false });
    expect(historyMetric(run({ map50: 0.8, map50_95: 0.5 }), "map50_95")).toEqual({ value: 0.5, lastEpoch: false });
  });

  it("falls back to the last epoch's value and flags it", () => {
    const cancelled = run({ status: "cancelled", last_map50: 0.4, map50_95: 0.2, last_map50_95: 0.2 });
    expect(historyMetric(cancelled, "map50")).toEqual({ value: 0.4, lastEpoch: true });
    expect(historyMetric(cancelled, "map50_95")).toEqual({ value: 0.2, lastEpoch: true });
  });

  it("returns null when nothing is known", () => {
    expect(historyMetric(run(), "map50")).toEqual({ value: null, lastEpoch: false });
    expect(historyMetric(run(), "map50_95")).toEqual({ value: null, lastEpoch: false });
  });
});
