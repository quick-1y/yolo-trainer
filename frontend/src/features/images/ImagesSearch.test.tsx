import { screen, waitFor } from "@testing-library/react";
import { VirtuosoGridMockContext } from "react-virtuoso";
import { describe, expect, it, vi } from "vitest";

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

function makeItems(count: number, prefix = "img"): ImageItem[] {
  return Array.from({ length: count }, (_, i) =>
    makeImageItem({ id: i + 1, filename: `${prefix}-${i + 1}.jpg` }),
  );
}

interface ListQuery {
  sort: string | null;
  q: string | null;
}

type ListHandler = (query: ListQuery) => Response;

/** Records every image-list request (sort + q) and answers through `list`. */
function stubFetch(list: ListHandler) {
  const requests: ListQuery[] = [];
  const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
    const url = new URL(String(input), "http://localhost");
    if (url.pathname.endsWith("/config")) {
      return jsonResponse(CONFIG);
    }
    if (url.pathname.endsWith("/projects/7/images")) {
      const query = { sort: url.searchParams.get("sort"), q: url.searchParams.get("q") };
      requests.push(query);
      return list(query);
    }
    if (url.pathname.endsWith("/projects/7")) {
      return jsonResponse(PROJECT);
    }
    throw new Error(`Unexpected request: ${url.pathname}`);
  });
  vi.stubGlobal("fetch", fetchMock);
  return requests;
}

function renderImagesPage() {
  return renderWithProviders(
    <VirtuosoGridMockContext.Provider value={MOCK_VIEWPORT}>
      <AppRoutes />
    </VirtuosoGridMockContext.Provider>,
    { route: "/projects/7/images" },
  );
}

function lastRequest(requests: ListQuery[]): ListQuery {
  return requests[requests.length - 1] as ListQuery;
}

/** 4 images when unfiltered, 2 for "car", none for "zzz". */
function carsList({ q }: ListQuery): Response {
  if (q === "zzz") {
    return jsonResponse({ items: [], next_cursor: null, total: 0 });
  }
  if (q === "car") {
    return jsonResponse({ items: makeItems(2, "car"), next_cursor: null, total: 2 });
  }
  return jsonResponse({ items: makeItems(4), next_cursor: null, total: 4 });
}

describe("Images search and sort toolbar", () => {
  it("requests newest first without q by default and by name after the toggle", async () => {
    const requests = stubFetch(carsList);

    const { user } = renderImagesPage();

    expect(await screen.findByText("img-1.jpg")).toBeInTheDocument();
    expect(requests[0]).toEqual({ sort: "newest", q: null });
    expect(screen.getByText("Images: 4")).toBeInTheDocument();

    await user.click(screen.getByText("By filename"));

    await waitFor(() => expect(lastRequest(requests)).toEqual({ sort: "name", q: null }));
  });

  it("sends the search once after the debounce and shows Found: N", async () => {
    const requests = stubFetch(carsList);

    const { user } = renderImagesPage();
    await screen.findByText("img-1.jpg");
    const before = requests.length;

    await user.type(screen.getByRole("textbox", { name: "Search by filename" }), "car");

    expect(await screen.findByText("car-1.jpg")).toBeInTheDocument();
    expect(lastRequest(requests)).toEqual({ sort: "newest", q: "car" });
    expect(screen.getByText("Found: 2")).toBeInTheDocument();
    expect(screen.queryByText("Images: 2")).not.toBeInTheDocument();
    // One request for the whole word - never one per keystroke.
    expect(requests.slice(before)).toEqual([{ sort: "newest", q: "car" }]);
  });

  it("keeps the search when the sort changes", async () => {
    const requests = stubFetch(carsList);

    const { user } = renderImagesPage();
    await screen.findByText("img-1.jpg");
    await user.type(screen.getByRole("textbox", { name: "Search by filename" }), "car");
    await screen.findByText("car-1.jpg");

    await user.click(screen.getByText("By filename"));

    await waitFor(() => expect(lastRequest(requests)).toEqual({ sort: "name", q: "car" }));
  });

  it("clears the search on Esc and shows the unfiltered list again", async () => {
    const requests = stubFetch(carsList);

    const { user } = renderImagesPage();
    await screen.findByText("img-1.jpg");
    const input = screen.getByRole("textbox", { name: "Search by filename" });
    await user.type(input, "car");
    await screen.findByText("car-1.jpg");

    await user.type(input, "{Escape}");

    expect(input).toHaveValue("");
    expect(await screen.findByText("img-4.jpg")).toBeInTheDocument();
    // The unfiltered list was loaded a moment ago and stays fresh (staleTime), so it comes
    // back from the cache instead of being requested again.
    expect(requests.filter((request) => request.sort === "newest" && request.q === null)).toHaveLength(1);
    expect(screen.getByText("Images: 4")).toBeInTheDocument();
  });

  it("clears the search with the clear button, shown only while the box has text", async () => {
    const requests = stubFetch(carsList);

    const { user } = renderImagesPage();
    await screen.findByText("img-1.jpg");
    expect(screen.queryByRole("button", { name: "Clear" })).not.toBeInTheDocument();
    const input = screen.getByRole("textbox", { name: "Search by filename" });
    await user.type(input, "car");
    await screen.findByText("car-1.jpg");

    await user.click(screen.getByRole("button", { name: "Clear" }));

    expect(input).toHaveValue("");
    expect(await screen.findByText("img-4.jpg")).toBeInTheDocument();
    // The unfiltered list was loaded a moment ago and stays fresh (staleTime), so it comes
    // back from the cache instead of being requested again.
    expect(requests.filter((request) => request.sort === "newest" && request.q === null)).toHaveLength(1);
    expect(screen.queryByRole("button", { name: "Clear" })).not.toBeInTheDocument();
  });

  it("shows No matching images with the query and a Clear search button", async () => {
    const requests = stubFetch(carsList);

    const { user } = renderImagesPage();
    await screen.findByText("img-1.jpg");
    const input = screen.getByRole("textbox", { name: "Search by filename" });
    await user.type(input, "zzz");

    expect(await screen.findByText("No matching images")).toBeInTheDocument();
    expect(screen.getByText(/No filenames contain "zzz"/)).toBeInTheDocument();
    expect(screen.getByText("Found: 0")).toBeInTheDocument();
    // The first-run empty state is for projects without any image only.
    expect(screen.queryByText("No images yet")).not.toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Clear search" }));

    expect(await screen.findByText("img-1.jpg")).toBeInTheDocument();
    expect(input).toHaveValue("");
    // The unfiltered list was loaded a moment ago and stays fresh (staleTime), so it comes
    // back from the cache instead of being requested again.
    expect(requests.filter((request) => request.sort === "newest" && request.q === null)).toHaveLength(1);
  });

  it("remounts the grid scroller when the sort changes so the new order starts at the top", async () => {
    stubFetch(carsList);

    const { user } = renderImagesPage();
    await screen.findByText("img-1.jpg");
    const before = document.querySelector('[data-testid="virtuoso-scroller"]');
    expect(before).not.toBeNull();

    await user.click(screen.getByText("By filename"));

    await waitFor(() => {
      const after = document.querySelector('[data-testid="virtuoso-scroller"]');
      expect(after).not.toBeNull();
      expect(after).not.toBe(before);
    });
  });
});
