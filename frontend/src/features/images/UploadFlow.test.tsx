import { screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";

vi.mock("@mantine/notifications", () => ({
  notifications: { show: vi.fn() },
}));

import { notifications } from "@mantine/notifications";

import { AppRoutes } from "../../app/routes";
import { renderWithProviders } from "../../test/render";

const PROJECT = {
  id: 7,
  name: "Cars",
  task_type: "detect",
  description: null,
  created_at: "2026-01-01T00:00:00Z",
  updated_at: "2026-01-01T00:00:00Z",
};

const CONFIG = {
  max_upload_mb: 50,
  max_upload_bytes: 50_000_000,
  accepted_extensions: ["jpg", "jpeg", "png", "webp", "bmp"],
};

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

function image(name: string): File {
  return new File([new Uint8Array(10)], name, { type: "image/jpeg" });
}

function uploadedNames(body: FormData): string[] {
  return body.getAll("files").map((entry) => (entry as File).name);
}

/** URL-routed fetch stub: project, config, an empty image list and uploads. */
function makeFetch(onUpload: (body: FormData) => Response | Promise<Response>) {
  return vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input);
    if (init?.method === "POST" && url.endsWith("/projects/7/images")) {
      return onUpload(init.body as FormData);
    }
    if (url.endsWith("/config")) {
      return jsonResponse(CONFIG);
    }
    if (url.includes("/projects/7/images")) {
      return jsonResponse({ items: [], next_cursor: null, total: 0 });
    }
    if (url.includes("/projects/7/classes")) {
      return jsonResponse([]);
    }
    if (url.endsWith("/projects/7")) {
      return jsonResponse(PROJECT);
    }
    throw new Error(`Unexpected request: ${url}`);
  });
}

function uploadResponse(body: FormData): Response {
  return jsonResponse({
    results: uploadedNames(body).map((filename) => ({
      filename,
      status: "added",
      reason: null,
      image: null,
    })),
  });
}

function postCalls(fetchMock: ReturnType<typeof makeFetch>) {
  return fetchMock.mock.calls.filter(([, init]) => init?.method === "POST");
}

async function fileInput(): Promise<HTMLInputElement> {
  await screen.findByRole("button", { name: "Upload images" });
  await waitFor(() => {
    expect(screen.getByRole("button", { name: "Upload images" })).toBeEnabled();
  });
  const input = document.querySelector<HTMLInputElement>('input[type="file"]:not([webkitdirectory])');
  if (input === null) {
    throw new Error("file input not found");
  }
  return input;
}

describe("Upload flow", () => {
  it("sends only supported files and counts the client-side rejection", async () => {
    const fetchMock = makeFetch(uploadResponse);
    vi.stubGlobal("fetch", fetchMock);
    renderWithProviders(<AppRoutes />, { route: "/projects/7/images" });
    // applyAccept off: the picker's accept filter is the browser's job; the
    // client pre-filter must still catch a non-image that slips through.
    const user = userEvent.setup({ applyAccept: false });

    const input = await fileInput();
    await user.upload(input, [image("a.jpg"), image("notes.txt")]);

    await waitFor(() => {
      expect(notifications.show).toHaveBeenCalled();
    });
    const posts = postCalls(fetchMock);
    expect(posts).toHaveLength(1);
    expect(uploadedNames(posts[0]?.[1]?.body as FormData)).toEqual(["a.jpg"]);

    const message = vi.mocked(notifications.show).mock.calls.at(-1)?.[0].message;
    expect(String(message)).toContain("Added: 1");
    expect(String(message)).toContain("Rejected: 1");
  });
});
