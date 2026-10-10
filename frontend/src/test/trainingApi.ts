import { vi } from "vitest";

// Untyped literals on purpose: they mirror the API JSON of Plan 04-01 / 04-02, and additive
// fields in later plans must never break `tsc` for tests that do not know about them.
type Json = Record<string, unknown>;

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

export function qualityFor(map50: number | null): string | null {
  if (map50 === null) {
    return null;
  }
  if (map50 >= 0.9) {
    return "excellent";
  }
  if (map50 >= 0.75) {
    return "good";
  }
  if (map50 >= 0.6) {
    return "fair";
  }
  return "poor";
}

/** Project 1 "Plates" (detect), the project every training test opens. */
export function makeProject(overrides: Json = {}): Json {
  return {
    id: 1,
    name: "Plates",
    task_type: "detect",
    description: null,
    created_at: "2026-01-15T10:00:00Z",
    updated_at: "2026-01-15T10:00:00Z",
    image_count: 10,
    class_count: 1,
    ...overrides,
  };
}

/** A queued run by default; `quality` follows `map50` the way the server computes it. */
export function makeRun(overrides: Json = {}): Json {
  const map50 = (overrides.map50 as number | null | undefined) ?? null;
  return {
    id: 1,
    project_id: 1,
    name: "run-1",
    status: "queued",
    queue_position: 1,
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
    quality: qualityFor(map50),
    settings: { epochs: 100, imgsz: 640, batch: -1, device: "auto" },
    resolved: null,
    dataset_counts: null,
    class_names: ["plate"],
    metrics: null,
    error_message: null,
    log_tail: null,
    ...overrides,
  };
}

export function officialModels(taskType: "detect" | "segment" = "detect"): Json[] {
  const suffix = taskType === "segment" ? "-seg" : "";
  return ["yolo26", "yolo11"].flatMap((family) =>
    ["n", "s", "m", "l", "x"].map((size) => ({ name: `${family}${size}${suffix}`, size })),
  );
}

/** A dataset a run can start from: Train and Valid hold images, everything is assigned. */
export function makeSummary(overrides: Json = {}): Json {
  return {
    train: { used: 8, unannotated: 0 },
    valid: { used: 2, unannotated: 0 },
    test: { used: 0, unannotated: 0 },
    unassigned: 0,
    class_count: 1,
    ...overrides,
  };
}

/** A model trained in this service (`TrainedModelOption`). */
export function makeTrainedModel(overrides: Json = {}): Json {
  return {
    id: 4,
    name: "best-cars",
    project_id: 2,
    project_name: "Plates",
    map50: 0.8123,
    class_count: 2,
    class_names: ["car", "plate"],
    classes_match: true,
    created_at: "2026-01-14T10:00:00Z",
    ...overrides,
  };
}

export function makeOptions(overrides: Json = {}): Json {
  return {
    task_type: "detect",
    next_run_name: "run-1",
    official: officialModels("detect"),
    default_base: "yolo26n",
    defaults: { epochs: 100, imgsz: 640, batch: -1, device: "auto" },
    devices: { gpus: [], worker_fresh: false },
    models: [],
    summary: makeSummary(),
    blockers: [],
    warnings: [],
    ...overrides,
  };
}

type Lazy<T> = T | (() => T);

function resolve<T>(value: Lazy<T>): T {
  return typeof value === "function" ? (value as () => T)() : value;
}

export interface StubTrainingOptions {
  /** GET /api/projects/1; defaults to `makeProject()`. */
  project?: Json;
  /** GET /api/projects/1/runs; a function is called per request so a poll can see new data. */
  runs?: Lazy<Json[]>;
  /** GET /api/projects/1/runs/:id for one run; any other id falls back to `runs`, then 404. */
  run?: Lazy<Json>;
  /** HTTP status of the runs list (500 -> `{"detail": "Database is unavailable."}`). */
  runsStatus?: number;
  /** HTTP status of GET /runs/:id for a known run. */
  runStatus?: number;
  /** GET /api/projects/1/training/options; defaults to `makeOptions()`. */
  options?: Lazy<Json>;
  /** HTTP status of the options request. */
  optionsStatus?: number;
  /** Body of the POST /runs response (default: a preparing run with id 12). */
  createResult?: Json;
  /** Status of the POST /runs response (default 201); anything else answers `createResult` as the error body. */
  createStatus?: number;
  /** Status of DELETE /api/projects/1/runs/:id (default 204); anything else answers `removeDetail` as the error. */
  removeStatus?: number;
  /** `detail` of a failed DELETE (default: the API's 409 message). */
  removeDetail?: string;
  /** DELETE answers only after this promise settles, so a test can look at the pending state. */
  removeGate?: Promise<void>;
  /** Body of POST /splits/auto/preview (default: 4 unassigned images -> Train 3, Valid 1). */
  splitPreview?: Json;
  /** Called when POST /splits/auto is applied, so a test can change what the options answer next. */
  onSplitApply?: () => void;
}

export interface StubTrainingApi {
  /** Parsed JSON bodies of every POST /api/projects/1/runs, in order. */
  posts: Json[];
  /** Paths of every DELETE /api/projects/1/runs/:id, in order. */
  deletes: string[];
  /** Parsed JSON bodies of every POST /api/projects/1/splits/auto (the apply call), in order. */
  splitApplies: Json[];
  /** "METHOD /path" of every request, in order. */
  requests: string[];
  /** How many requests matched exactly this "METHOD /path". */
  count: (request: string) => number;
}

/**
 * Strict `fetch` stub for the Training pages: answers the project, the run list, one run,
 * the start-form options and run creation, and throws `Unexpected request` for anything else
 * so a page that starts asking for more fails loudly.
 */
export function stubTrainingApi(stub: StubTrainingOptions = {}): StubTrainingApi {
  const posts: Json[] = [];
  const deletes: string[] = [];
  const splitApplies: Json[] = [];
  const requests: string[] = [];

  const fetchMock = vi.fn(async (input: string | URL | Request, init?: RequestInit) => {
    const url = new URL(
      typeof input === "string" ? input : input.toString(),
      "http://localhost",
    );
    const method = init?.method ?? "GET";
    const path = url.pathname;
    requests.push(`${method} ${path}`);

    if (method === "GET" && path === "/api/projects/1") {
      return json(stub.project ?? makeProject());
    }
    if (method === "GET" && path === "/api/projects/1/runs") {
      if (stub.runsStatus !== undefined && stub.runsStatus !== 200) {
        return json({ detail: "Database is unavailable." }, stub.runsStatus);
      }
      return json(resolve(stub.runs ?? []));
    }
    if (method === "POST" && path === "/api/projects/1/runs") {
      posts.push(JSON.parse(String(init?.body)) as Json);
      const status = stub.createStatus ?? 201;
      return json(stub.createResult ?? makeRun({ id: 12, status: "preparing" }), status);
    }
    const runMatch = /^\/api\/projects\/1\/runs\/(\d+)$/.exec(path);
    if (method === "DELETE" && runMatch !== null) {
      deletes.push(path);
      if (stub.removeGate !== undefined) {
        await stub.removeGate;
      }
      const status = stub.removeStatus ?? 204;
      if (status === 204) {
        return new Response(null, { status: 204 });
      }
      return json(
        {
          detail:
            stub.removeDetail ??
            "This run has already started and can no longer be removed from the queue.",
        },
        status,
      );
    }
    if (method === "GET" && runMatch !== null) {
      const id = Number(runMatch[1]);
      const single = stub.run === undefined ? undefined : resolve(stub.run);
      const found =
        single !== undefined && single.id === id
          ? single
          : resolve(stub.runs ?? []).find((candidate) => candidate.id === id);
      if (found === undefined) {
        return json({ detail: "Run not found." }, 404);
      }
      if (stub.runStatus !== undefined && stub.runStatus !== 200) {
        return json({ detail: "Database is unavailable." }, stub.runStatus);
      }
      return json(found);
    }
    if (method === "POST" && path === "/api/projects/1/splits/auto/preview") {
      return json(
        stub.splitPreview ?? {
          seed: 7,
          unassigned_total: 4,
          counts: { train: 3, valid: 1, test: 0 },
        },
      );
    }
    if (method === "POST" && path === "/api/projects/1/splits/auto") {
      splitApplies.push(JSON.parse(String(init?.body)) as Json);
      stub.onSplitApply?.();
      return json({ counts: { train: 3, valid: 1, test: 0 } });
    }
    if (method === "GET" && path === "/api/projects/1/training/options") {
      if (stub.optionsStatus !== undefined && stub.optionsStatus !== 200) {
        return json({ detail: "Database is unavailable." }, stub.optionsStatus);
      }
      return json(resolve(stub.options ?? makeOptions()));
    }
    throw new Error(`Unexpected request: ${method} ${path}`);
  });
  vi.stubGlobal("fetch", fetchMock);

  return {
    posts,
    deletes,
    splitApplies,
    requests,
    count: (request) => requests.filter((entry) => entry === request).length,
  };
}
