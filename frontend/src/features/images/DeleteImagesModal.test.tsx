import { screen, waitFor, within } from "@testing-library/react";
import { VirtuosoGridMockContext } from "react-virtuoso";
import { describe, expect, it, vi } from "vitest";

vi.mock("@mantine/notifications", () => ({
  notifications: { show: vi.fn() },
}));

import { notifications } from "@mantine/notifications";

import type { ImageItem } from "../../api/images";
import { AppRoutes } from "../../app/routes";
import { renderWithProviders } from "../../test/render";

const MOCK_VIEWPORT = { viewportWidth: 1200, viewportHeight: 800, itemWidth: 184, itemHeight: 208 };

const PROJECT = {
  id: 7,
  name: "Cars",
  task_type: "detect",
  description: null,
  created_at: "2026-01-01T00:00:00Z",
  updated_at: "2026-01-01T00:00:00Z",
  image_count: 4,
  class_count: 0,
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

function makeItems(count: number): ImageItem[] {
  return Array.from({ length: count }, (_, i) => ({
    id: i + 1,
    filename: `img-${i + 1}.jpg`,
    width: 640,
    height: 480,
    size_bytes: 1000,
    created_at: "2026-01-01T00:00:00Z",
  }));
}

type DeleteHandler = (body: { ids: number[] }) => Response | Promise<Response>;

/** URL + method routed stub: project, config, a 4-image list and the delete route. */
function stubFetch(onDelete: DeleteHandler) {
  const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = new URL(String(input), "http://localhost");
    const method = init?.method ?? "GET";
    if (url.pathname.endsWith("/config")) {
      return jsonResponse(CONFIG);
    }
    if (url.pathname.endsWith("/projects/7/images/delete") && method === "POST") {
      return onDelete(JSON.parse(String(init?.body)) as { ids: number[] });
    }
    if (url.pathname.endsWith("/projects/7/images")) {
      return jsonResponse({ items: makeItems(4), next_cursor: null, total: 4 });
    }
    if (url.pathname.endsWith("/projects/7")) {
      return jsonResponse(PROJECT);
    }
    throw new Error(`Unexpected request: ${method} ${url.pathname}`);
  });
  vi.stubGlobal("fetch", fetchMock);
  return fetchMock;
}

function deleteCalls(fetchMock: ReturnType<typeof stubFetch>) {
  return fetchMock.mock.calls.filter(
    (call) =>
      String(call[0]).endsWith("/projects/7/images/delete") &&
      (call[1] as RequestInit | undefined)?.method === "POST",
  );
}

function detailCalls(fetchMock: ReturnType<typeof stubFetch>) {
  return fetchMock.mock.calls.filter((call) => String(call[0]).endsWith("/api/projects/7"));
}

async function renderGrid() {
  const rendered = renderWithProviders(
    <VirtuosoGridMockContext.Provider value={MOCK_VIEWPORT}>
      <AppRoutes />
    </VirtuosoGridMockContext.Provider>,
    { route: "/projects/7/images" },
  );
  await screen.findByText("img-1.jpg");
  return rendered;
}

function checkbox(index: number): HTMLElement {
  return screen.getByRole("checkbox", { name: `Select img-${index}.jpg` });
}

describe("select and delete images", () => {
  it("selecting a tile checkbox shows the selection bar and does not open the editor", async () => {
    stubFetch(() => jsonResponse({ deleted: 0 }));
    const { user } = await renderGrid();

    await user.click(checkbox(1));

    expect(await screen.findByText("Selected: 1")).toBeInTheDocument();
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    expect(screen.queryByRole("textbox", { name: "Search by filename" })).not.toBeInTheDocument();
    expect(checkbox(1)).toBeChecked();
    expect(checkbox(2)).not.toBeChecked();
  });

  it("clear selection empties it and brings the toolbar back", async () => {
    stubFetch(() => jsonResponse({ deleted: 0 }));
    const { user } = await renderGrid();

    await user.click(checkbox(1));
    await user.click(await screen.findByRole("button", { name: "Clear selection" }));

    expect(screen.queryByText("Selected: 1")).not.toBeInTheDocument();
    expect(screen.getByRole("textbox", { name: "Search by filename" })).toBeInTheDocument();
    expect(checkbox(1)).not.toBeChecked();
  });

  it("Delete opens the confirmation and Cancel closes it, both without any request", async () => {
    const fetchMock = stubFetch(() => jsonResponse({ deleted: 2 }));
    const { user } = await renderGrid();

    await user.click(checkbox(1));
    await user.click(checkbox(3));
    await user.click(await screen.findByRole("button", { name: "Delete" }));

    const dialog = await screen.findByRole("dialog");
    expect(within(dialog).getByText("Delete images")).toBeInTheDocument();
    expect(
      within(dialog).getByText(
        "Selected: 2. These images and their files will be permanently deleted from this project. This cannot be undone.",
      ),
    ).toBeInTheDocument();
    expect(deleteCalls(fetchMock)).toHaveLength(0);

    await user.click(within(dialog).getByRole("button", { name: "Cancel" }));
    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());

    expect(deleteCalls(fetchMock)).toHaveLength(0);
    expect(screen.getByText("Selected: 2")).toBeInTheDocument();
  });

  it("Escape inside the dialog closes it without sending a delete request", async () => {
    const fetchMock = stubFetch(() => jsonResponse({ deleted: 1 }));
    const { user } = await renderGrid();

    await user.click(checkbox(2));
    await user.click(await screen.findByRole("button", { name: "Delete" }));
    await screen.findByRole("dialog");
    await user.keyboard("{Escape}");

    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
    expect(deleteCalls(fetchMock)).toHaveLength(0);
    expect(screen.getByText("Selected: 1")).toBeInTheDocument();
  });

  it("Delete permanently posts the ids once, locks the dialog while pending, then updates the grid", async () => {
    let release: (response: Response) => void = () => undefined;
    const fetchMock = stubFetch(
      () =>
        new Promise<Response>((resolve) => {
          release = resolve;
        }),
    );
    const { user } = await renderGrid();
    expect(await screen.findByText("Images: 4")).toBeInTheDocument();
    const detailBefore = detailCalls(fetchMock).length;

    await user.click(checkbox(1));
    await user.click(checkbox(3));
    await user.click(await screen.findByRole("button", { name: "Delete" }));
    const dialog = await screen.findByRole("dialog");
    await user.click(within(dialog).getByRole("button", { name: "Delete permanently" }));

    await waitFor(() => expect(deleteCalls(fetchMock)).toHaveLength(1));
    const [url, init] = deleteCalls(fetchMock)[0] as [string, RequestInit];
    expect(url).toBe("/api/projects/7/images/delete");
    expect(JSON.parse(String(init.body))).toEqual({ ids: [1, 3] });
    await waitFor(() => expect(within(dialog).getByRole("button", { name: "Cancel" })).toBeDisabled());
    expect(within(dialog).getByRole("button", { name: "Delete permanently" })).toBeDisabled();

    release(jsonResponse({ deleted: 2 }));

    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
    expect(screen.queryByText("img-1.jpg")).not.toBeInTheDocument();
    expect(screen.queryByText("img-3.jpg")).not.toBeInTheDocument();
    expect(screen.getByText("img-2.jpg")).toBeInTheDocument();
    expect(screen.getByText("img-4.jpg")).toBeInTheDocument();
    expect(screen.getByText("Images: 2")).toBeInTheDocument();
    expect(screen.queryByText(/^Selected:/)).not.toBeInTheDocument();
    expect(notifications.show).toHaveBeenCalledWith(
      expect.objectContaining({ color: "green", message: "Deleted images: 2" }),
    );
    expect(deleteCalls(fetchMock)).toHaveLength(1);
    // Project counts refresh without refetching the image pages.
    await waitFor(() => expect(detailCalls(fetchMock).length).toBeGreaterThan(detailBefore));
  });

  it("shows the API message in a red alert and keeps the dialog open on a 500", async () => {
    const fetchMock = stubFetch(() => jsonResponse({ detail: "Database is unavailable" }, 500));
    const { user } = await renderGrid();

    await user.click(checkbox(2));
    await user.click(await screen.findByRole("button", { name: "Delete" }));
    const dialog = await screen.findByRole("dialog");
    await user.click(within(dialog).getByRole("button", { name: "Delete permanently" }));

    expect(await within(dialog).findByText("Database is unavailable")).toBeInTheDocument();
    expect(screen.getByRole("dialog")).toBeInTheDocument();
    expect(within(dialog).getByRole("button", { name: "Delete permanently" })).toBeEnabled();
    expect(screen.getByText("img-2.jpg")).toBeInTheDocument();
    expect(deleteCalls(fetchMock)).toHaveLength(1);
    expect(notifications.show).not.toHaveBeenCalled();
  });

  it("never sends a delete request before the confirm button is pressed", async () => {
    const fetchMock = stubFetch(() => jsonResponse({ deleted: 1 }));
    const { user } = await renderGrid();

    await user.click(checkbox(1));
    await user.keyboard("{Delete}");
    await user.keyboard("{Backspace}");
    await user.keyboard("{Enter}");
    await user.click(await screen.findByRole("button", { name: "Delete" }));
    await screen.findByRole("dialog");
    await user.keyboard("{Enter}");

    expect(deleteCalls(fetchMock)).toHaveLength(0);
  });
});
