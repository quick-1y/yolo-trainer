import { act, screen, waitFor } from "@testing-library/react";
import type { ReactNode } from "react";
import { describe, expect, it, vi } from "vitest";

interface CapturedDropzoneProps {
  onDrop: (files: File[]) => void;
  useFsAccessApi?: boolean;
  accept?: unknown;
  children?: ReactNode;
}

const captured = vi.hoisted(() => ({ props: null as CapturedDropzoneProps | null }));

// Dropzone.FullScreen listens to document drag events and reads files through
// react-dropzone, none of which jsdom can drive: stub it, record its props and
// assert the wiring (onDrop -> upload queue) deterministically.
vi.mock("@mantine/dropzone", () => ({
  Dropzone: {
    FullScreen: (props: CapturedDropzoneProps) => {
      captured.props = props;
      return <div data-testid="dropzone-fullscreen">{props.children}</div>;
    },
  },
}));

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

function makeStub({ manual = false }: { manual?: boolean } = {}) {
  const pending: Array<() => void> = [];
  const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input);
    if (init?.method === "POST" && url.endsWith("/projects/7/images")) {
      const body = init.body as FormData;
      const respond = () =>
        jsonResponse({
          results: uploadedNames(body).map((filename) => ({
            filename,
            status: "added",
            reason: null,
            image: null,
          })),
        });
      if (!manual) {
        return respond();
      }
      return new Promise<Response>((resolve) => pending.push(() => resolve(respond())));
    }
    if (url.endsWith("/config")) {
      return jsonResponse(CONFIG);
    }
    if (url.includes("/projects/7/images")) {
      return jsonResponse({ items: [], next_cursor: null, total: 0 });
    }
    if (url.endsWith("/projects/7")) {
      return jsonResponse(PROJECT);
    }
    throw new Error(`Unexpected request: ${url}`);
  });
  const posts = () => fetchMock.mock.calls.filter(([, init]) => init?.method === "POST");
  return { fetchMock, pending, posts };
}

function capturedProps(): CapturedDropzoneProps {
  if (captured.props === null) {
    throw new Error("Dropzone.FullScreen was not rendered");
  }
  return captured.props;
}

async function renderImagesPage(stub: ReturnType<typeof makeStub>) {
  captured.props = null;
  vi.stubGlobal("fetch", stub.fetchMock);
  renderWithProviders(<AppRoutes />, { route: "/projects/7/images" });
  // The drop handler reads the limits from the query cache: wait until loaded.
  await waitFor(() => {
    // Header buttons and the empty-state buttons are both present.
    for (const button of screen.getAllByRole("button", { name: "Upload images" })) {
      expect(button).toBeEnabled();
    }
  });
  return capturedProps();
}

describe("UploadDropzone", () => {
  it("renders a window-wide dropzone without an accept filter and without the FS Access API", async () => {
    const props = await renderImagesPage(makeStub());

    expect(props.useFsAccessApi).toBe(false);
    expect(props.accept).toBeUndefined();
    expect(screen.getByText("Drop images or a folder to upload")).toBeInTheDocument();
  });

  it("uploads dropped images and reports a dropped non-image as rejected", async () => {
    const stub = makeStub();
    const props = await renderImagesPage(stub);

    act(() => props.onDrop([image("a.jpg"), image("notes.txt")]));

    expect(await screen.findByText("Upload complete")).toBeInTheDocument();
    expect(stub.posts()).toHaveLength(1);
    expect(uploadedNames(stub.posts()[0]?.[1]?.body as FormData)).toEqual(["a.jpg"]);
    expect(screen.getByText("Added: 1")).toBeInTheDocument();
    expect(screen.getByText("Rejected: 1")).toBeInTheDocument();
  });

  it("ignores a drop while an upload is running and shows the busy notification", async () => {
    const stub = makeStub({ manual: true });
    const props = await renderImagesPage(stub);

    act(() => props.onDrop([image("a.jpg")]));
    expect(await screen.findByText("Uploading: 0 of 1")).toBeInTheDocument();

    act(() => props.onDrop([image("b.jpg"), image("c.jpg")]));

    expect(notifications.show).toHaveBeenCalledWith(
      expect.objectContaining({ color: "yellow", message: "An upload is already in progress." }),
    );
    expect(stub.posts()).toHaveLength(1);

    stub.pending[0]?.();
    expect(await screen.findByText("Upload complete")).toBeInTheDocument();
  });
});
