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
 * fail with 500 ("error") or 503 ("unavailable"), refuse with 409 (the image changed
 * elsewhere), reject with 422 ("rejected": the server's message is `rejectedDetail`) or
 * answer 404 ("gone": the image was deleted).
 */
export type PutMode = "ok" | "hold" | "error" | "unavailable" | "conflict" | "rejected" | "gone";

/** The 422 message the stub sends for the "rejected" PUT mode. */
export const REJECTED_DETAIL = "Unknown class.";

/**
 * How GET /images/next-unannotated answers: the id (or null for "none"), optionally held open
 * until `releaseNextUnannotated()`, or a 500 with the given detail.
 */
export type NextUnannotatedMode = { image_id: number | null; hold?: boolean } | { error: string };

interface EditorApiOptions {
  classes?: unknown[];
  boxes?: unknown[];
  version?: number;
  /** The stored image is reviewed. */
  isReviewed?: boolean;
  /** The stored image is marked as background (no boxes). */
  isBackground?: boolean;
  /** Status of GET /images/5 (and its annotations); 404 simulates a deleted image. */
  imageStatus?: number;
  /** GET /classes: answer (default), never answer, or fail with 500. POST /classes always works. */
  classesMode?: "ok" | "pending" | "error";
  /** GET /images/5/neighbors (default: a single image with no neighbors). */
  neighbors?: NeighborsFixture;
  putMode?: PutMode;
  /** The first PUTs are answered with these modes in order; later ones use `putMode`. */
  putQueue?: PutMode[];
  /** GET /images/5/annotations answers 500 with this message (until `setAnnotationsError(null)`). */
  annotationsError?: string;
  /** GET /images/5 answers 500 with this message (until `setImageError(null)`). */
  imageError?: string;
  /** GET /images/next-unannotated (default: no other unannotated image). */
  nextUnannotated?: NextUnannotatedMode;
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
    isBackground = false,
    imageStatus = 200,
  } = options;
  let classesMode = options.classesMode ?? "ok";
  let putMode: PutMode = options.putMode ?? "ok";
  const putQueue: PutMode[] = [...(options.putQueue ?? [])];
  let annotationsError: string | null = options.annotationsError ?? null;
  let imageError: string | null = options.imageError ?? null;
  // What GET annotations answers once a test replaced the stored set: a refetch after a 409
  // or 422 sees the other tab's (or the server's) version.
  let serverSet: { version: number; boxes: unknown[] } | null = null;
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
  const nextUnannotatedRequests: URLSearchParams[] = [];
  const nextUnannotated = options.nextUnannotated ?? { image_id: null };
  // Resolves the next-unannotated lookups held open by `hold: true`.
  let releaseLookup: () => void = () => {};
  const lookupGate = new Promise<void>((resolve) => {
    releaseLookup = resolve;
  });
  // POST /classes appends here, so the next GET /classes answers with the new class.
  const classList: unknown[] = [...classes];
  const puts: Array<Record<string, unknown>> = [];
  const annotationGets: number[] = [];
  const classGets: number[] = [];
  const posts: Array<Record<string, unknown>> = [];

  const fetchMock = vi.fn(async (input: string | URL | Request, init?: RequestInit) => {
    const url = new URL(typeof input === "string" ? input : input.toString(), "http://localhost");
    const method = init?.method ?? "GET";
    const path = url.pathname;

    if (method === "GET" && path === "/api/projects/1") {
      return json(PROJECT);
    }
    if (method === "GET" && path === "/api/projects/1/classes") {
      classGets.push(1);
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
    if (method === "GET" && path === "/api/projects/1/images/next-unannotated") {
      nextUnannotatedRequests.push(url.searchParams);
      if ("error" in nextUnannotated) {
        return json({ detail: nextUnannotated.error }, 500);
      }
      if (nextUnannotated.hold) {
        await lookupGate;
      }
      return json({ image_id: nextUnannotated.image_id });
    }
    const otherImage = /^\/api\/projects\/1\/images\/(\d+)(\/|$)/.exec(path);
    if (method === "GET" && otherImage !== null && otherImage[1] !== "5") {
      // Any other image (a neighbor the test navigated to) does not exist in this stub.
      return json({ detail: "Image not found." }, 404);
    }
    if (method === "GET" && path === "/api/projects/1/images/5") {
      if (imageError !== null) {
        return json({ detail: imageError }, 500);
      }
      return imageStatus === 200 ? json(IMAGE) : json({ detail: "Image not found." }, imageStatus);
    }
    if (method === "GET" && path === "/api/projects/1/images/5/annotations") {
      annotationGets.push(1);
      if (annotationsError !== null) {
        return json({ detail: annotationsError }, 500);
      }
      const shownBoxes = serverSet?.boxes ?? boxes;
      return imageStatus === 200
        ? json({
            version: serverSet?.version ?? version,
            is_background: isBackground,
            is_reviewed: isReviewed,
            status: isReviewed
              ? "reviewed"
              : shownBoxes.length > 0 || isBackground
                ? "annotated"
                : "unannotated",
            boxes: shownBoxes,
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
      const mode = putQueue.shift() ?? putMode;
      if (mode === "hold") {
        await heldGate;
      } else if (mode === "error") {
        return json({ detail: "The save failed." }, 500);
      } else if (mode === "unavailable") {
        return json({ detail: "Service unavailable." }, 503);
      } else if (mode === "conflict") {
        return json({ detail: "This image was changed elsewhere." }, 409);
      } else if (mode === "rejected") {
        return json({ detail: REJECTED_DETAIL }, 422);
      } else if (mode === "gone") {
        return json({ detail: "Image not found." }, 404);
      }
      return json({
        version: body.base_version + 1,
        box_count: body.boxes.length,
        status: body.is_reviewed
          ? "reviewed"
          : body.boxes.length > 0 || body.is_background
            ? "annotated"
            : "unannotated",
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
    /** One entry per GET /images/5/annotations and per GET /classes so far. */
    annotationGets,
    classGets,
    neighborRequests,
    nextUnannotatedRequests,
    fetchMock,
    /** Answer every next-unannotated lookup held open so far. */
    releaseNextUnannotated: () => releaseLookup(),
    /** Switch what the next GET /classes does (a retry after a failure). */
    setClassesMode: (mode: "ok" | "pending" | "error") => {
      classesMode = mode;
    },
    /** Change how later PUTs are answered; leaving "hold" never releases an already held PUT. */
    setPutMode: (mode: PutMode) => {
      putMode = mode;
    },
    /** Queue more answers for the next PUTs (consumed before `putMode`). */
    queuePuts: (...modes: PutMode[]) => {
      putQueue.push(...modes);
    },
    /** What later GET /images/5/annotations answer (a refetch after a conflict); `null` resets. */
    setServerSet: (next: { version: number; boxes: unknown[] } | null) => {
      serverSet = next;
    },
    /** Make GET /images/5/annotations fail with 500 and this message (`null`: answer again). */
    setAnnotationsError: (message: string | null) => {
      annotationsError = message;
    },
    /** Make GET /images/5 fail with 500 and this message (`null`: answer again). */
    setImageError: (message: string | null) => {
      imageError = message;
    },
    /** Answer every PUT held open so far with a normal save. */
    releasePuts: () => {
      releaseHeld();
      resetGate();
    },
  };
}
