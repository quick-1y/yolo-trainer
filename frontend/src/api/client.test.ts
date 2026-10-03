import { afterEach, describe, expect, it, vi } from "vitest";

import { ApiError, apiRequest } from "./client";

function stubFetch(response: Response) {
  const fetchMock = vi.fn(async () => response);
  vi.stubGlobal("fetch", fetchMock);
  return fetchMock;
}

function firstCallHeaders(fetchMock: ReturnType<typeof stubFetch>): Record<string, string> {
  const calls = fetchMock.mock.calls as unknown as [string, RequestInit][];
  return calls[0][1].headers as Record<string, string>;
}

describe("apiRequest", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("leaves Content-Type to the browser for a FormData body and sends X-Requested-With", async () => {
    const fetchMock = stubFetch(new Response(JSON.stringify({ results: [] }), { status: 200 }));
    const body = new FormData();
    body.append("files", new File(["x"], "a.png", { type: "image/png" }), "a.png");

    await apiRequest("/projects/1/images", { method: "POST", body });

    const headers = firstCallHeaders(fetchMock);
    expect(Object.keys(headers).map((key) => key.toLowerCase())).not.toContain("content-type");
    expect(headers["X-Requested-With"]).toBe("yolo-trainer");
  });

  it("sets Content-Type application/json for a JSON string body", async () => {
    const fetchMock = stubFetch(new Response(JSON.stringify({ id: 1 }), { status: 200 }));

    await apiRequest("/projects", { method: "POST", body: JSON.stringify({ name: "x" }) });

    const headers = firstCallHeaders(fetchMock);
    expect(headers["Content-Type"]).toBe("application/json");
    expect(headers["X-Requested-With"]).toBe("yolo-trainer");
  });

  it("sets no Content-Type when there is no body", async () => {
    const fetchMock = stubFetch(new Response(JSON.stringify([]), { status: 200 }));

    await apiRequest("/projects");

    expect(Object.keys(firstCallHeaders(fetchMock))).not.toContain("Content-Type");
  });

  it("throws an ApiError carrying the JSON detail and the status for a non-2xx response", async () => {
    stubFetch(
      new Response(JSON.stringify({ detail: "Missing required request header." }), {
        status: 403,
      }),
    );

    const error = await apiRequest("/projects/1/images", { method: "POST" }).catch(
      (caught: unknown) => caught,
    );

    expect(error).toBeInstanceOf(ApiError);
    expect((error as ApiError).message).toBe("Missing required request header.");
    expect((error as ApiError).status).toBe(403);
  });
});
