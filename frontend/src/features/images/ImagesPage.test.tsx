import { fireEvent, screen, waitFor, within } from "@testing-library/react";
import { VirtuosoGridMockContext } from "react-virtuoso";
import { describe, expect, it, vi } from "vitest";

import type { ImageItem } from "../../api/images";
import { AppRoutes } from "../../app/routes";
import { makeImageItem } from "../../test/fixtures";
import { renderWithProviders } from "../../test/render";
import { handleImagesSideRequest } from "../../test/stubImagesApi";

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

function makeItems(count: number, offset = 0): ImageItem[] {
  return Array.from({ length: count }, (_, i) =>
    makeImageItem({ id: offset + i + 1, filename: `img-${offset + i + 1}.jpg` }),
  );
}

type ListHandler = (cursor: string | null) => Response | Promise<Response>;

/** URL-routed fetch stub: project, config and a programmable image list. */
function stubFetch(list: ListHandler) {
  const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
    const url = new URL(String(input), "http://localhost");
    const side = handleImagesSideRequest(url);
    if (side !== null) {
      return side;
    }
    if (url.pathname.endsWith("/config")) {
      return jsonResponse(CONFIG);
    }
    if (url.pathname.endsWith("/projects/7/images")) {
      return list(url.searchParams.get("cursor"));
    }
    if (url.pathname.endsWith("/projects/7")) {
      return jsonResponse(PROJECT);
    }
    throw new Error(`Unexpected request: ${url.pathname}`);
  });
  vi.stubGlobal("fetch", fetchMock);
  return fetchMock;
}

function renderImagesPage() {
  return renderWithProviders(
    <VirtuosoGridMockContext.Provider value={MOCK_VIEWPORT}>
      <AppRoutes />
    </VirtuosoGridMockContext.Provider>,
    { route: "/projects/7/images" },
  );
}

describe("ImagesPage states", () => {
  it("shows the empty state with the hint and both upload buttons", async () => {
    stubFetch(() => jsonResponse({ items: [], next_cursor: null, total: 0 }));

    renderImagesPage();

    expect(await screen.findByText("No images yet")).toBeInTheDocument();
    expect(
      screen.getByText(
        "Drag and drop images or a whole folder here, or choose them with the buttons below.",
      ),
    ).toBeInTheDocument();
    await waitFor(() =>
      expect(screen.getByText("JPG, PNG, WEBP or BMP, up to 50 MB each.")).toBeInTheDocument(),
    );
    const emptyState = screen.getByText("No images yet").closest(".mantine-EmptyState-root");
    expect(emptyState).not.toBeNull();
    const scoped = within(emptyState as HTMLElement);
    expect(scoped.getByRole("button", { name: "Upload images" })).toBeInTheDocument();
    expect(scoped.getByRole("button", { name: "Upload folder" })).toBeInTheDocument();
  });

  it("renders 24 skeleton tiles while the first page is pending", async () => {
    stubFetch(() => new Promise<Response>(() => undefined));

    renderImagesPage();

    const tiles = await screen.findAllByTestId("grid-skeleton-tile");
    expect(tiles).toHaveLength(24);
    expect(screen.queryByText("No images yet")).not.toBeInTheDocument();
  });

  it("shows the API message on a failed first page and refetches on Try again", async () => {
    let calls = 0;
    stubFetch(() => {
      calls += 1;
      if (calls === 1) {
        return jsonResponse({ detail: "Database is unavailable" }, 500);
      }
      return jsonResponse({ items: makeItems(3), next_cursor: null, total: 3 });
    });

    const { user } = renderImagesPage();

    expect(await screen.findByText("Database is unavailable")).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Try again" }));

    expect(await screen.findByText("img-1.jpg")).toBeInTheDocument();
    expect(screen.getByText("img-3.jpg")).toBeInTheDocument();
    expect(screen.queryByText("Database is unavailable")).not.toBeInTheDocument();
  });

  it("shows the loading-more footer while the next page is loading", async () => {
    stubFetch((cursor) => {
      if (cursor === null) {
        return jsonResponse({ items: makeItems(3), next_cursor: "c1", total: 6 });
      }
      return new Promise<Response>(() => undefined);
    });

    renderImagesPage();

    expect(await screen.findByText("Loading more…")).toBeInTheDocument();
  });

  it("shows an inline error with retry when the next page fails", async () => {
    let secondPageCalls = 0;
    stubFetch((cursor) => {
      if (cursor === null) {
        return jsonResponse({ items: makeItems(3), next_cursor: "c1", total: 6 });
      }
      secondPageCalls += 1;
      if (secondPageCalls === 1) {
        return jsonResponse({ detail: "boom" }, 500);
      }
      return jsonResponse({ items: makeItems(3, 3), next_cursor: null, total: 6 });
    });

    const { user } = renderImagesPage();

    expect(await screen.findByText("Could not load more images.")).toBeInTheDocument();
    expect(screen.getByText("img-1.jpg")).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Try again" }));

    expect(await screen.findByText("img-6.jpg")).toBeInTheDocument();
  });

  it("keeps every tile when some thumbnails fail and shows No preview for the failed ones", async () => {
    stubFetch(() => jsonResponse({ items: makeItems(3), next_cursor: null, total: 3 }));

    renderImagesPage();

    await screen.findByText("img-1.jpg");
    const thumbs = document.querySelectorAll("img");
    expect(thumbs).toHaveLength(3);
    fireEvent.error(thumbs[1] as HTMLImageElement);

    expect(await screen.findAllByText("No preview")).toHaveLength(1);
    expect(document.querySelectorAll("img")).toHaveLength(2);
    expect(screen.getByText("img-1.jpg")).toBeInTheDocument();
    expect(screen.getByText("img-2.jpg")).toBeInTheDocument();
    expect(screen.getByText("img-3.jpg")).toBeInTheDocument();
  });
});
