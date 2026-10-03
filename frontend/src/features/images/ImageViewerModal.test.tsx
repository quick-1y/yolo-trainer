import { fireEvent, screen, waitFor, within } from "@testing-library/react";
import { VirtuosoGridMockContext } from "react-virtuoso";
import { describe, expect, it, vi } from "vitest";

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
  return Array.from({ length: count }, (_, i) => ({
    id: offset + i + 1,
    filename: `img-${offset + i + 1}.jpg`,
    width: 640,
    height: 480,
    size_bytes: 2_500_000,
    created_at: "2026-01-01T00:00:00Z",
  }));
}

type ListHandler = (cursor: string | null) => Response | Promise<Response>;

function stubFetch(list: ListHandler) {
  const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
    const url = new URL(String(input), "http://localhost");
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

/** The viewer's stage image: the only <img> served from the /file route. */
function stageImage(): HTMLImageElement | null {
  return document.querySelector<HTMLImageElement>('img[src$="/file"]');
}

function dialog(): HTMLElement {
  return screen.getByRole("dialog");
}

describe("ImageViewerModal opening", () => {
  it("opens the clicked image full size with its filename, dimensions, size and position", async () => {
    stubFetch(() => jsonResponse({ items: makeItems(3), next_cursor: null, total: 3 }));
    const { user } = renderImagesPage();

    await user.click(await screen.findByRole("button", { name: "img-2.jpg" }));

    const modal = await screen.findByRole("dialog");
    const title = within(modal).getByText("img-2.jpg");
    expect(title).toHaveAttribute("title", "img-2.jpg");
    await waitFor(() => expect(stageImage()).not.toBeNull());
    expect(stageImage()?.getAttribute("src")).toBe("/api/projects/7/images/2/file");
    expect(within(modal).getByText("640 × 480 px")).toBeInTheDocument();
    expect(within(modal).getByText("2.5 MB")).toBeInTheDocument();
    expect(within(modal).getByText("2 of 3")).toBeInTheDocument();
  });

  it("never requests an original while the viewer is closed", async () => {
    stubFetch(() => jsonResponse({ items: makeItems(3), next_cursor: null, total: 3 }));
    renderImagesPage();

    await screen.findByRole("button", { name: "img-1.jpg" });

    expect(stageImage()).toBeNull();
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });

  it("opens a focused tile with Enter", async () => {
    stubFetch(() => jsonResponse({ items: makeItems(3), next_cursor: null, total: 3 }));
    const { user } = renderImagesPage();

    const tile = await screen.findByRole("button", { name: "img-3.jpg" });
    tile.focus();
    await user.keyboard("{Enter}");

    const modal = await screen.findByRole("dialog");
    expect(within(modal).getByText("3 of 3")).toBeInTheDocument();
    await waitFor(() => expect(stageImage()?.getAttribute("src")).toBe("/api/projects/7/images/3/file"));
  });

  it("still opens the viewer from a tile whose thumbnail failed to load", async () => {
    stubFetch(() => jsonResponse({ items: makeItems(3), next_cursor: null, total: 3 }));
    const { user } = renderImagesPage();

    const tile = await screen.findByRole("button", { name: "img-1.jpg" });
    fireEvent.error(tile.querySelector("img") as HTMLImageElement);
    expect(await screen.findByText("No preview")).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "img-1.jpg" }));

    await screen.findByRole("dialog");
    await waitFor(() => expect(stageImage()?.getAttribute("src")).toBe("/api/projects/7/images/1/file"));
    expect(within(dialog()).getByText("1 of 3")).toBeInTheDocument();
  });
});

describe("ImageViewerModal navigation", () => {
  it("steps through the loaded images with the arrow keys and disables the ends", async () => {
    stubFetch(() => jsonResponse({ items: makeItems(3), next_cursor: null, total: 3 }));
    const { user } = renderImagesPage();
    await user.click(await screen.findByRole("button", { name: "img-1.jpg" }));
    const modal = await screen.findByRole("dialog");
    expect(within(modal).getByText("1 of 3")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Previous image" })).toBeDisabled();

    await user.keyboard("{ArrowRight}");
    expect(within(modal).getByText("2 of 3")).toBeInTheDocument();
    expect(within(modal).getByText("img-2.jpg")).toBeInTheDocument();
    await user.keyboard("{ArrowRight}");
    expect(within(modal).getByText("3 of 3")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Next image" })).toBeDisabled();

    await user.keyboard("{ArrowLeft}");
    expect(within(modal).getByText("2 of 3")).toBeInTheDocument();
    expect(stageImage()?.getAttribute("src")).toBe("/api/projects/7/images/2/file");
  });

  it("moves with the on-screen arrow buttons", async () => {
    stubFetch(() => jsonResponse({ items: makeItems(3), next_cursor: null, total: 3 }));
    const { user } = renderImagesPage();
    await user.click(await screen.findByRole("button", { name: "img-2.jpg" }));
    await screen.findByRole("dialog");

    await user.click(screen.getByRole("button", { name: "Next image" }));
    expect(within(dialog()).getByText("3 of 3")).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Previous image" }));
    await user.click(screen.getByRole("button", { name: "Previous image" }));
    expect(within(dialog()).getByText("1 of 3")).toBeInTheDocument();
  });

  it("closes on Escape", async () => {
    stubFetch(() => jsonResponse({ items: makeItems(3), next_cursor: null, total: 3 }));
    const { user } = renderImagesPage();
    await user.click(await screen.findByRole("button", { name: "img-1.jpg" }));
    await screen.findByRole("dialog");

    await user.keyboard("{Escape}");

    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
  });

  it("loads the next page at the end of the loaded list and continues on it", async () => {
    let release: (response: Response) => void = () => undefined;
    const fetchMock = stubFetch((cursor) => {
      if (cursor === null) {
        return jsonResponse({ items: makeItems(100), next_cursor: "c1", total: 200 });
      }
      return new Promise<Response>((resolve) => {
        release = resolve;
      });
    });
    const { user } = renderImagesPage();
    await user.click(await screen.findByRole("button", { name: "img-1.jpg" }));
    await screen.findByRole("dialog");
    // Walk to the last loaded image (index 100).
    await user.keyboard("{ArrowRight}".repeat(99));
    expect(within(dialog()).getByText("100 of 200")).toBeInTheDocument();

    await user.keyboard("{ArrowRight}");

    await waitFor(() =>
      expect(
        fetchMock.mock.calls.some(([input]) => String(input).includes("cursor=c1")),
      ).toBe(true),
    );
    expect(screen.getByRole("button", { name: "Next image" })).toHaveAttribute(
      "data-loading",
      "true",
    );
    expect(within(dialog()).getByText("100 of 200")).toBeInTheDocument();

    release(jsonResponse({ items: makeItems(100, 100), next_cursor: null, total: 200 }));

    expect(await within(dialog()).findByText("101 of 200")).toBeInTheDocument();
    expect(within(dialog()).getByText("img-101.jpg")).toBeInTheDocument();
  });
});

describe("ImageViewerModal stage states", () => {
  it("shows a loader until the original fires load", async () => {
    stubFetch(() => jsonResponse({ items: makeItems(2), next_cursor: null, total: 2 }));
    const { user } = renderImagesPage();
    await user.click(await screen.findByRole("button", { name: "img-1.jpg" }));
    await screen.findByRole("dialog");
    await waitFor(() => expect(stageImage()).not.toBeNull());

    expect(screen.getByTestId("viewer-loader")).toBeInTheDocument();
    fireEvent.load(stageImage() as HTMLImageElement);

    await waitFor(() => expect(screen.queryByTestId("viewer-loader")).not.toBeInTheDocument());
  });

  it("shows the failure message on error and arrows keep working", async () => {
    stubFetch(() => jsonResponse({ items: makeItems(2), next_cursor: null, total: 2 }));
    const { user } = renderImagesPage();
    await user.click(await screen.findByRole("button", { name: "img-1.jpg" }));
    await screen.findByRole("dialog");
    await waitFor(() => expect(stageImage()).not.toBeNull());

    fireEvent.error(stageImage() as HTMLImageElement);

    expect(await screen.findByText("Could not load this image.")).toBeInTheDocument();
    expect(screen.queryByTestId("viewer-loader")).not.toBeInTheDocument();
    await user.keyboard("{ArrowRight}");
    expect(within(dialog()).getByText("2 of 2")).toBeInTheDocument();
    expect(screen.queryByText("Could not load this image.")).not.toBeInTheDocument();
    expect(screen.getByTestId("viewer-loader")).toBeInTheDocument();
  });
});
