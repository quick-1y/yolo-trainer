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

interface EditorApiOptions {
  classes?: unknown[];
  boxes?: unknown[];
  version?: number;
  /** Status of GET /images/5 (and its annotations); 404 simulates a deleted image. */
  imageStatus?: number;
}

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

/**
 * Stub `fetch` for the editor route: project 1, image 5, its annotation set,
 * the classes and the PUT. Every PUT body is parsed into `puts`; anything else
 * throws, so an unexpected request fails the test loudly.
 */
export function stubEditorApi(options: EditorApiOptions = {}) {
  const { classes = [CAR_CLASS], boxes = [], version = 0, imageStatus = 200 } = options;
  const puts: Array<Record<string, unknown>> = [];

  const fetchMock = vi.fn(async (input: string | URL | Request, init?: RequestInit) => {
    const url = new URL(typeof input === "string" ? input : input.toString(), "http://localhost");
    const method = init?.method ?? "GET";
    const path = url.pathname;

    if (method === "GET" && path === "/api/projects/1") {
      return json(PROJECT);
    }
    if (method === "GET" && path === "/api/projects/1/classes") {
      return json(classes);
    }
    if (method === "GET" && path === "/api/projects/1/images/5") {
      return imageStatus === 200 ? json(IMAGE) : json({ detail: "Image not found." }, imageStatus);
    }
    if (method === "GET" && path === "/api/projects/1/images/5/annotations") {
      return imageStatus === 200
        ? json({
            version,
            is_background: false,
            is_reviewed: false,
            status: boxes.length > 0 ? "annotated" : "unannotated",
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
  return { puts, fetchMock };
}
