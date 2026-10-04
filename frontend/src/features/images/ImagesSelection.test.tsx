import { fireEvent, screen, waitFor } from "@testing-library/react";
import type { UserEvent } from "@testing-library/user-event";
import { useLocation } from "react-router-dom";
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
  image_count: 10,
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

function stubFetch() {
  const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
    const url = new URL(String(input), "http://localhost");
    if (url.pathname.endsWith("/config")) {
      return jsonResponse(CONFIG);
    }
    if (url.pathname.endsWith("/projects/7/images")) {
      return jsonResponse({ items: makeItems(10), next_cursor: null, total: 10 });
    }
    if (url.pathname.endsWith("/projects/7")) {
      return jsonResponse(PROJECT);
    }
    // The editor's own GETs after navigation (image detail, annotations, classes).
    if (url.pathname.includes("/projects/7/images/") || url.pathname.endsWith("/classes")) {
      return jsonResponse({ detail: "Not found." }, 404);
    }
    throw new Error(`Unexpected request: ${url.pathname}`);
  });
  vi.stubGlobal("fetch", fetchMock);
  return fetchMock;
}

function LocationProbe() {
  const location = useLocation();
  return (
    <>
      <div data-testid="pathname">{location.pathname}</div>
      <div data-testid="search">{location.search}</div>
    </>
  );
}

async function renderGrid(route = "/projects/7/images") {
  stubFetch();
  const rendered = renderWithProviders(
    <VirtuosoGridMockContext.Provider value={MOCK_VIEWPORT}>
      <AppRoutes />
      <LocationProbe />
    </VirtuosoGridMockContext.Provider>,
    { route },
  );
  await screen.findByText("img-1.jpg");
  return rendered;
}

function checkbox(index: number): HTMLElement {
  return screen.getByRole("checkbox", { name: `Select img-${index}.jpg` });
}

function tile(index: number): HTMLElement {
  return screen.getByRole("button", { name: `img-${index}.jpg` });
}

function selectedIndexes(): number[] {
  return Array.from({ length: 10 }, (_, i) => i + 1).filter((index) =>
    (checkbox(index) as HTMLInputElement).checked,
  );
}

async function shiftClick(user: UserEvent, element: HTMLElement) {
  await user.keyboard("{Shift>}");
  await user.click(element);
  await user.keyboard("{/Shift}");
}

describe("range selection", () => {
  it("Shift-click selects every tile between the last toggled tile and the clicked one", async () => {
    const { user } = await renderGrid();

    await user.click(checkbox(2));
    await shiftClick(user, checkbox(6));

    expect(await screen.findByText("Selected: 5")).toBeInTheDocument();
    expect(selectedIndexes()).toEqual([2, 3, 4, 5, 6]);
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });

  it("keeps the range anchored on the last toggled tile after another Shift-click", async () => {
    const { user } = await renderGrid();

    await user.click(checkbox(2));
    await shiftClick(user, checkbox(6));
    await shiftClick(user, checkbox(4));

    expect(await screen.findByText("Selected: 5")).toBeInTheDocument();
    expect(selectedIndexes()).toEqual([2, 3, 4, 5, 6]);
  });

  it("anchors on the most recent plain click, not on an older one", async () => {
    const { user } = await renderGrid();

    await user.click(checkbox(2));
    await user.click(checkbox(9));
    await shiftClick(user, checkbox(6));

    expect(selectedIndexes()).toEqual([2, 6, 7, 8, 9]);
  });

  it("Shift-click without an earlier toggle selects just that tile", async () => {
    const { user } = await renderGrid();

    await shiftClick(user, checkbox(5));

    expect(selectedIndexes()).toEqual([5]);
  });
});

describe("selection keyboard rules", () => {
  it("Escape clears the selection", async () => {
    const { user } = await renderGrid();

    await user.click(checkbox(1));
    expect(await screen.findByText("Selected: 1")).toBeInTheDocument();
    await user.keyboard("{Escape}");

    await waitFor(() => expect(screen.queryByText("Selected: 1")).not.toBeInTheDocument());
    expect(selectedIndexes()).toEqual([]);
  });

  it("clicking a tile opens the editor for that image with the grid's sort and search", async () => {
    const { user } = await renderGrid("/projects/7/images?sort=name&q=img");

    await user.click(tile(3));

    await waitFor(() =>
      expect(screen.getByTestId("pathname")).toHaveTextContent("/projects/7/annotate/3"),
    );
    expect(screen.getByTestId("search")).toHaveTextContent(/^\?sort=name&q=img$/);
  });

  it("changing the search clears the selection", async () => {
    const { user } = await renderGrid();

    // Select first, then change the search; the toolbar stays mounted (hidden) while
    // the selection bar shows, so the debounced commit must clear the selection.
    await user.click(checkbox(1));
    expect(await screen.findByText("Selected: 1")).toBeInTheDocument();
    fireEvent.change(screen.getByRole("textbox", { name: "Search by filename", hidden: true }), {
      target: { value: "img" },
    });

    await waitFor(() => expect(screen.queryByText("Selected: 1")).not.toBeInTheDocument());
    expect(selectedIndexes()).toEqual([]);
  });

  it("Tab moves from the tile to its checkbox, Space toggles it, Enter on the tile opens the editor", async () => {
    const { user } = await renderGrid();

    tile(1).focus();
    await user.tab();
    expect(checkbox(1)).toHaveFocus();

    await user.keyboard(" ");
    expect(await screen.findByText("Selected: 1")).toBeInTheDocument();
    expect(selectedIndexes()).toEqual([1]);
    expect(screen.getByTestId("pathname")).toHaveTextContent("/projects/7/images");

    tile(2).focus();
    await user.keyboard("{Enter}");
    await waitFor(() =>
      expect(screen.getByTestId("pathname")).toHaveTextContent("/projects/7/annotate/2"),
    );
  });

  it("marks every tile as selecting while one is selected", async () => {
    const { user } = await renderGrid();
    const tiles = () => Array.from({ length: 10 }, (_, i) => tile(i + 1));
    expect(tiles().filter((element) => element.hasAttribute("data-selecting"))).toHaveLength(0);

    await user.click(checkbox(4));

    await waitFor(() =>
      expect(tiles().filter((element) => element.hasAttribute("data-selecting"))).toHaveLength(10),
    );
    expect(tile(4)).toHaveAttribute("data-selected");
    expect(tile(5)).not.toHaveAttribute("data-selected");
  });
});
