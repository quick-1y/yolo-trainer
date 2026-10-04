import { vi } from "vitest";

// Fixtures are plain untyped literals on purpose: later plans add response
// fields, and a typed fixture would break `tsc` for every older test.
export const PROJECT = {
  id: 1,
  name: "Vehicles",
  task_type: "detect",
  description: null,
  created_at: "2026-01-15T10:00:00Z",
  updated_at: "2026-01-15T10:00:00Z",
  image_count: 1,
  class_count: 1,
};

export const IMAGE = {
  id: 5,
  filename: "photo.jpg",
  width: 300,
  height: 200,
  size_bytes: 12345,
  created_at: "2026-01-15T10:00:00Z",
  box_count: 0,
  is_background: false,
  is_reviewed: false,
  status: "unannotated",
};

export const CAR_CLASS = {
  id: 7,
  name: "car",
  color: "#E6194B",
  index: 0,
  created_at: "2026-01-15T10:00:00Z",
};

export interface NeighborsFixture {
  position: number | null;
  total: number;
  prev_id: number | null;
  next_id: number | null;
}

/** One image, no neighbors: both arrows are disabled. */
export const NO_NEIGHBORS: NeighborsFixture = {
  position: 1,
  total: 1,
  prev_id: null,
  next_id: null,
};

/**
 * How the stub answers PUT: save, keep the request open until `releasePuts()`,
 * fail with 500, or refuse with 409 (the image changed elsewhere).
 */
export type PutMode = "ok" | "hold" | "error" | "conflict";

interface EditorApiOptions {
  classes?: unknown[];
  boxes?: unknown[];
  version?: number;
  /** The stored image is reviewed. */
  isReviewed?: boolean;
  /** Status of GET /images/5 (and its annotations); 404 simulates a deleted image. */
  imageStatus?: number;
  /** GET /classes: answer (default), never answer, or fail with 500. POST /classes always works. */
  classesMode?: "ok" | "pending" | "error";
  /** GET /images/5/neighbors (default: a single image with no neighbors). */
  neighbors?: NeighborsFixture;
  putMode?: PutMode;
}

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

/**
 * Stub `fetch` for the editor route: project 1, image 5, its annotation set,
 * the classes, POST /classes and the PUT. Every PUT body is parsed into `puts`; anything else
 * throws, so an unexpected request fails the test loudly.
 */
export function stubEditorApi(options: EditorApiOptions = {}) {
  const {
    classes = [CAR_CLASS],
    boxes = [],
    version = 0,
    isReviewed = false,
    imageStatus = 200,
  } = options;
  let classesMode = options.classesMode ?? "ok";
  let putMode: PutMode = options.putMode ?? "ok";
  // Resolves the PUTs held open by putMode "hold".
  let releaseHeld: () => void = () => {};
  let heldGate: Promise<void> = Promise.resolve();
  const resetGate = () => {
    heldGate = new Promise<void>((resolve) => {
      releaseHeld = resolve;
    });
  };
  resetGate();
  const neighbors = options.neighbors ?? NO_NEIGHBORS;
  const neighborRequests: URLSearchParams[] = [];
  // POST /classes appends here, so the next GET /classes answers with the new class.
  const classList: unknown[] = [...classes];
  const puts: Array<Record<string, unknown>> = [];
  const posts: Array<Record<string, unknown>> = [];

  const fetchMock = vi.fn(async (input: string | URL | Request, init?: RequestInit) => {
    const url = new URL(typeof input === "string" ? input : input.toString(), "http://localhost");
    const method = init?.method ?? "GET";
    const path = url.pathname;

    if (method === "GET" && path === "/api/projects/1") {
      return json(PROJECT);
    }
    if (method === "GET" && path === "/api/projects/1/classes") {
      if (classesMode === "pending") {
        return new Promise<Response>(() => {});
      }
      return classesMode === "error"
        ? json({ detail: "Classes are unavailable." }, 500)
        : json(classList);
    }
    if (method === "POST" && path === "/api/projects/1/classes") {
      const body = JSON.parse(String(init?.body)) as { name: string };
      posts.push(body);
      const created = {
        id: 100 + classList.length,
        name: body.name,
        color: "#3CB44B",
        index: classList.length,
        created_at: "2026-01-15T10:00:00Z",
        object_count: 0,
      };
      classList.push(created);
      return json(created, 201);
    }
    if (method === "GET" && path === "/api/projects/1/images") {
      // The grid a test lands on after leaving the editor: empty is enough.
      return json({ items: [], next_cursor: null, total: 0 });
    }
    if (method === "GET" && path === "/api/projects/1/images/5/neighbors") {
      neighborRequests.push(url.searchParams);
      return json(neighbors);
    }
    const otherImage = /^\/api\/projects\/1\/images\/(\d+)(\/|$)/.exec(path);
    if (method === "GET" && otherImage !== null && otherImage[1] !== "5") {
      // Any other image (a neighbor the test navigated to) does not exist in this stub.
      return json({ detail: "Image not found." }, 404);
    }
    if (method === "GET" && path === "/api/projects/1/images/5") {
      return imageStatus === 200 ? json(IMAGE) : json({ detail: "Image not found." }, imageStatus);
    }
    if (method === "GET" && path === "/api/projects/1/images/5/annotations") {
      return imageStatus === 200
        ? json({
            version,
            is_background: false,
            is_reviewed: isReviewed,
            status: isReviewed ? "reviewed" : boxes.length > 0 ? "annotated" : "unannotated",
            boxes,
          })
        : json({ detail: "Image not found." }, imageStatus);
    }
    if (method === "PUT" && path === "/api/projects/1/images/5/annotations") {
      const body = JSON.parse(String(init?.body)) as Record<string, unknown> & {
        base_version: number;
        boxes: unknown[];
        is_background: boolean;
        is_reviewed: boolean;
      };
      puts.push(body);
      if (putMode === "hold") {
        await heldGate;
      } else if (putMode === "error") {
        return json({ detail: "The save failed." }, 500);
      } else if (putMode === "conflict") {
        return json({ detail: "This image was changed elsewhere." }, 409);
      }
      return json({
        version: body.base_version + 1,
        box_count: body.boxes.length,
        status: body.boxes.length > 0 ? "annotated" : "unannotated",
        is_background: body.is_background,
        is_reviewed: body.is_reviewed,
      });
    }
    throw new Error(`Unexpected request: ${method} ${path}`);
  });

  vi.stubGlobal("fetch", fetchMock);
  return {
    puts,
    posts,
    neighborRequests,
    fetchMock,
    /** Switch what the next GET /classes does (a retry after a failure). */
    setClassesMode: (mode: "ok" | "pending" | "error") => {
      classesMode = mode;
    },
    /** Change how later PUTs are answered; leaving "hold" never releases an already held PUT. */
    setPutMode: (mode: PutMode) => {
      putMode = mode;
    },
    /** Answer every PUT held open so far with a normal save. */
    releasePuts: () => {
      releaseHeld();
      resetGate();
    },
  };
}
