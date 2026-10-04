import { screen, waitFor, within } from "@testing-library/react";
import { VirtuosoGridMockContext } from "react-virtuoso";
import { describe, expect, it, vi } from "vitest";

vi.mock("@mantine/notifications", () => ({
  notifications: { show: vi.fn() },
}));

import type { ImageItem } from "../../api/images";
import { AppRoutes } from "../../app/routes";
import { makeImageItem } from "../../test/fixtures";
import { renderWithProviders } from "../../test/render";

const MOCK_VIEWPORT = { viewportWidth: 1200, viewportHeight: 800, itemWidth: 184, itemHeight: 208 };

const PROJECT = {
  id: 7,
  name: "Cars",
  task_type: "detect",
  description: null,
  created_at: "2026-01-01T00:00:00Z",
  updated_at: "2026-01-01T00:00:00Z",
  image_count: 6,
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

function makeItem(id: number, prefix: string): ImageItem {
  return makeImageItem({ id, filename: `${prefix}-${id}.jpg` });
}

interface ListRequest {
  q: string;
  cursor: string | null;
}

interface StubOptions {
  /** Answers one list request; `attempt` counts the requests with the same (q, cursor), from 1. */
  list: (request: ListRequest, attempt: number) => Response;
  onDelete: (ids: number[]) => Response;
}

/** URL + method routed stub: project, config, the image list and the delete route. */
function stubFetch({ list, onDelete }: StubOptions) {
  const listRequests: ListRequest[] = [];
  const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = new URL(String(input), "http://localhost");
    const method = init?.method ?? "GET";
    if (url.pathname.endsWith("/config")) {
      return jsonResponse(CONFIG);
    }
    if (url.pathname.endsWith("/projects/7/images/delete") && method === "POST") {
      return onDelete((JSON.parse(String(init?.body)) as { ids: number[] }).ids);
    }
    if (url.pathname.endsWith("/projects/7/images")) {
      const request = {
        q: url.searchParams.get("q") ?? "",
        cursor: url.searchParams.get("cursor"),
      };
      listRequests.push(request);
      const attempt = listRequests.filter(
        (earlier) => earlier.q === request.q && earlier.cursor === request.cursor,
      ).length;
      return list(request, attempt);
    }
    if (url.pathname.endsWith("/projects/7")) {
      return jsonResponse(PROJECT);
    }
    throw new Error(`Unexpected request: ${method} ${url.pathname}`);
  });
  vi.stubGlobal("fetch", fetchMock);
  return {
    count: (q: string, cursor: string | null) =>
      listRequests.filter((request) => request.q === q && request.cursor === cursor).length,
  };
}

function renderGrid() {
  return renderWithProviders(
    <VirtuosoGridMockContext.Provider value={MOCK_VIEWPORT}>
      <AppRoutes />
    </VirtuosoGridMockContext.Provider>,
    { route: "/projects/7/images" },
  );
}

type User = ReturnType<typeof renderGrid>["user"];

/** Tick the given tiles, then Delete and Delete permanently, and wait for the dialog to close. */
async function deleteTiles(user: User, filenames: string[]) {
  for (const filename of filenames) {
    await user.click(screen.getByRole("checkbox", { name: `Select ${filename}` }));
  }
  await user.click(await screen.findByRole("button", { name: "Delete" }));
  const dialog = await screen.findByRole("dialog");
  await user.click(within(dialog).getByRole("button", { name: "Delete permanently" }));
  await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
}

const FIRST_PAGE = [1, 2, 3].map((id) => makeItem(id, "img"));
const SECOND_PAGE = [4, 5, 6].map((id) => makeItem(id, "img"));

describe("deleting every loaded image while the server has more pages", () => {
  it("loads the next page by itself instead of showing the empty state", async () => {
    const stub = stubFetch({
      list: ({ cursor }, attempt) => {
        if (cursor === null) {
          return jsonResponse({ items: FIRST_PAGE, next_cursor: "c1", total: 6 });
        }
        return attempt === 1
          ? jsonResponse({ detail: "Database is unavailable" }, 500)
          : jsonResponse({ items: SECOND_PAGE, next_cursor: null, total: 3 });
      },
      onDelete: () => jsonResponse({ deleted: 3 }),
    });
    const { user } = renderGrid();
    expect(await screen.findByText("Could not load more images.")).toBeInTheDocument();

    await deleteTiles(user, ["img-1.jpg", "img-2.jpg", "img-3.jpg"]);

    expect(await screen.findByText("img-4.jpg")).toBeInTheDocument();
    expect(screen.getByText("img-5.jpg")).toBeInTheDocument();
    expect(screen.getByText("img-6.jpg")).toBeInTheDocument();
    expect(screen.getByText("Images: 3")).toBeInTheDocument();
    expect(screen.queryByText("No images yet")).not.toBeInTheDocument();
    expect(stub.count("", "c1")).toBe(2);
  });

  it("does not loop on a failing next page and offers the footer retry with no tile loaded", async () => {
    const stub = stubFetch({
      list: ({ cursor }, attempt) => {
        if (cursor === null) {
          return jsonResponse({ items: FIRST_PAGE, next_cursor: "c1", total: 6 });
        }
        return attempt <= 2
          ? jsonResponse({ detail: "Database is unavailable" }, 500)
          : jsonResponse({ items: SECOND_PAGE, next_cursor: null, total: 3 });
      },
      onDelete: () => jsonResponse({ deleted: 3 }),
    });
    const { user } = renderGrid();
    expect(await screen.findByText("Could not load more images.")).toBeInTheDocument();
    expect(stub.count("", "c1")).toBe(1);

    await deleteTiles(user, ["img-1.jpg", "img-2.jpg", "img-3.jpg"]);

    // The prune cleared the old error, the page loaded the next page once and that failed again.
    await waitFor(() => expect(stub.count("", "c1")).toBe(2));
    expect(await screen.findByText("Could not load more images.")).toBeInTheDocument();
    const retry = screen.getByRole("button", { name: "Try again" });
    expect(screen.queryByText("No images yet")).not.toBeInTheDocument();
    expect(screen.queryByText("img-4.jpg")).not.toBeInTheDocument();
    expect(stub.count("", "c1")).toBe(2);

    await user.click(retry);

    expect(await screen.findByText("img-4.jpg")).toBeInTheDocument();
    expect(screen.getByText("img-6.jpg")).toBeInTheDocument();
    expect(stub.count("", "c1")).toBe(3);
  });

  it("loads the next page of a search result instead of 'No matching images'", async () => {
    const carFirst = [11, 12, 13].map((id) => makeItem(id, "car"));
    const carSecond = [14, 15, 16].map((id) => makeItem(id, "car"));
    const stub = stubFetch({
      list: ({ q, cursor }, attempt) => {
        if (q === "") {
          return jsonResponse({ items: FIRST_PAGE, next_cursor: null, total: 3 });
        }
        if (cursor === null) {
          return jsonResponse({ items: carFirst, next_cursor: "c1", total: 6 });
        }
        return attempt === 1
          ? jsonResponse({ detail: "Database is unavailable" }, 500)
          : jsonResponse({ items: carSecond, next_cursor: null, total: 3 });
      },
      onDelete: () => jsonResponse({ deleted: 3 }),
    });
    const { user } = renderGrid();
    await screen.findByText("img-1.jpg");

    await user.type(screen.getByRole("textbox", { name: "Search by filename" }), "car");
    expect(await screen.findByText("car-11.jpg")).toBeInTheDocument();
    expect(await screen.findByText("Could not load more images.")).toBeInTheDocument();

    await deleteTiles(user, ["car-11.jpg", "car-12.jpg", "car-13.jpg"]);

    expect(await screen.findByText("car-14.jpg")).toBeInTheDocument();
    expect(screen.getByText("Found: 3")).toBeInTheDocument();
    expect(screen.queryByText("No matching images")).not.toBeInTheDocument();
    expect(stub.count("car", "c1")).toBe(2);
  });
});
