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

function image(name: string, relativePath?: string): File {
  const file = new File([new Uint8Array(10)], name, { type: "image/jpeg" });
  if (relativePath !== undefined) {
    Object.defineProperty(file, "webkitRelativePath", { value: relativePath });
  }
  return file;
}

function images(count: number): File[] {
  return Array.from({ length: count }, (_, i) => image(`img-${i}.jpg`));
}

function uploadedNames(body: FormData): string[] {
  return body.getAll("files").map((entry) => (entry as File).name);
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

interface PendingUpload {
  names: string[];
  release: () => void;
}

interface StubOptions {
  /** Hold every upload until the test releases it. */
  manual?: boolean;
  /** Answer every upload with this response instead of a normal result. */
  failWith?: () => Response;
}

/** URL-routed fetch stub: project, config, an empty image list and uploads. */
function makeStub({ manual = false, failWith }: StubOptions = {}) {
  const pending: PendingUpload[] = [];
  const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input);
    if (init?.method === "POST" && url.endsWith("/projects/7/images")) {
      const body = init.body as FormData;
      if (failWith !== undefined) {
        return failWith();
      }
      if (!manual) {
        return uploadResponse(body);
      }
      return new Promise<Response>((resolve, reject) => {
        pending.push({ names: uploadedNames(body), release: () => resolve(uploadResponse(body)) });
        init.signal?.addEventListener("abort", () =>
          reject(new DOMException("Aborted", "AbortError")),
        );
      });
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
  const posts = () => fetchMock.mock.calls.filter(([, init]) => init?.method === "POST");
  const listGets = () =>
    fetchMock.mock.calls.filter(
      ([url, init]) => init?.method === undefined && String(url).includes("/projects/7/images?"),
    ).length;
  return { fetchMock, pending, posts, listGets };
}

async function renderImagesPage(stub: ReturnType<typeof makeStub>) {
  vi.stubGlobal("fetch", stub.fetchMock);
  renderWithProviders(<AppRoutes />, { route: "/projects/7/images" });
  // applyAccept off: the picker's accept filter is the browser's job; the
  // client pre-filter must still catch a non-image that slips through.
  const user = userEvent.setup({ applyAccept: false });
  await waitFor(() => {
    expect(screen.getByRole("button", { name: "Upload images" })).toBeEnabled();
  });
  const input = document.querySelector<HTMLInputElement>(
    'input[type="file"]:not([webkitdirectory])',
  );
  const folderInput = document.querySelector<HTMLInputElement>('input[webkitdirectory]');
  if (input === null || folderInput === null) {
    throw new Error("file inputs not found");
  }
  return { user, input, folderInput };
}

describe("Upload flow", () => {
  it("sends only supported files in one request and reports the client-side rejection", async () => {
    const stub = makeStub();
    const { user, input } = await renderImagesPage(stub);

    await user.upload(input, [image("a.jpg"), image("notes.txt")]);

    expect(await screen.findByText("Upload complete")).toBeInTheDocument();
    const posts = stub.posts();
    expect(posts).toHaveLength(1);
    expect(uploadedNames(posts[0]?.[1]?.body as FormData)).toEqual(["a.jpg"]);
    expect(screen.getByText("Added: 1")).toBeInTheDocument();
    expect(screen.getByText("Rejected: 1")).toBeInTheDocument();
  });

  it("uploads a chosen folder through the hidden webkitdirectory input", async () => {
    const stub = makeStub();
    const { user, folderInput } = await renderImagesPage(stub);
    expect(folderInput).toHaveAttribute("webkitdirectory");

    await user.upload(folderInput, [
      image("a.jpg", "x/a.jpg"),
      image("b.png", "x/sub/b.png"),
      image("notes.txt", "x/notes.txt"),
    ]);

    expect(await screen.findByText("Upload complete")).toBeInTheDocument();
    expect(uploadedNames(stub.posts()[0]?.[1]?.body as FormData)).toEqual(["a.jpg", "b.png"]);

    await user.click(screen.getByRole("button", { name: "Show rejected files (1)" }));
    expect(screen.getByText("notes.txt")).toBeVisible();
    expect(screen.getByText("Not a supported image (JPG, PNG, WEBP, BMP).")).toBeVisible();
  });

  it("keeps progress across route changes and ignores a second start while running", async () => {
    const stub = makeStub({ manual: true });
    const { user, input } = await renderImagesPage(stub);

    await user.upload(input, images(1));
    expect(await screen.findByText("Uploading: 0 of 1")).toBeInTheDocument();

    expect(screen.getByTestId("images-nav-loader")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Upload images" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "Upload folder" })).toBeDisabled();

    await user.upload(input, images(2));
    expect(notifications.show).toHaveBeenCalledWith(
      expect.objectContaining({ color: "yellow", message: "An upload is already in progress." }),
    );
    expect(stub.posts()).toHaveLength(1);

    await user.click(screen.getByRole("link", { name: "Classes" }));
    await user.click(await screen.findByRole("link", { name: "Images" }));
    expect(await screen.findByText("Uploading: 0 of 1")).toBeInTheDocument();

    stub.pending[0]?.release();
    expect(await screen.findByText("Upload complete")).toBeInTheDocument();
    expect(screen.queryByTestId("images-nav-loader")).not.toBeInTheDocument();
  });

  it("refreshes the image list once after a multi-batch upload, not once per batch", async () => {
    const stub = makeStub({ manual: true });
    const { user, input } = await renderImagesPage(stub);
    await waitFor(() => expect(stub.listGets()).toBe(1));

    await user.upload(input, images(25));
    await waitFor(() => expect(stub.pending).toHaveLength(3));

    stub.pending[0]?.release();
    stub.pending[1]?.release();
    expect(await screen.findByText("Uploading: 20 of 25")).toBeInTheDocument();
    expect(stub.listGets()).toBe(1);

    stub.pending[2]?.release();
    expect(await screen.findByText("Upload complete")).toBeInTheDocument();
    await waitFor(() => expect(stub.listGets()).toBe(2));
    await new Promise((resolve) => setTimeout(resolve, 50));
    expect(stub.listGets()).toBe(2);
  });

  it("cancel starts no new batch and reports how many files were processed", async () => {
    const stub = makeStub({ manual: true });
    const { user, input } = await renderImagesPage(stub);

    await user.upload(input, images(40));
    await waitFor(() => expect(stub.pending).toHaveLength(3));
    stub.pending[0]?.release();
    await waitFor(() => expect(stub.pending).toHaveLength(4));

    await user.click(screen.getByRole("button", { name: "Cancel" }));

    expect(
      await screen.findByText("Upload cancelled: 10 of 40 files processed"),
    ).toBeInTheDocument();
    expect(stub.pending).toHaveLength(4);
    expect(screen.getByText("Added: 10")).toBeInTheDocument();
  });

  it("turns every file of a failed batch into a rejected entry and shows the retry hint", async () => {
    const stub = makeStub({
      failWith: () =>
        new Response("<html>too big</html>", {
          status: 413,
          statusText: "Request Entity Too Large",
        }),
    });
    const { user, input } = await renderImagesPage(stub);

    await user.upload(input, images(3));

    expect(await screen.findByText("Upload complete")).toBeInTheDocument();
    expect(screen.getByText("Rejected: 3")).toBeInTheDocument();
    expect(screen.getByText(/can be uploaded again/)).toBeVisible();

    await user.click(screen.getByRole("button", { name: "Show rejected files (3)" }));
    expect(screen.getAllByText("Upload failed. Try again.")).toHaveLength(3);
  });

  it("adds up to the number of submitted files: added + already present + rejected", async () => {
    const stub = makeStub();
    const { user, input } = await renderImagesPage(stub);
    const files = [...images(12), image("a.txt"), image("b.gif")];

    await user.upload(input, files);

    expect(await screen.findByText("Upload complete")).toBeInTheDocument();
    expect(screen.getByText("Added: 12")).toBeInTheDocument();
    expect(screen.getByText("Rejected: 2")).toBeInTheDocument();
  });
});
