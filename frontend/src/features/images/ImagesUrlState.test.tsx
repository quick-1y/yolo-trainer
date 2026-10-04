import { screen, waitFor } from "@testing-library/react";
import { useLocation, useNavigationType } from "react-router-dom";
import { VirtuosoGridMockContext } from "react-virtuoso";
import { describe, expect, it, vi } from "vitest";

import { AppRoutes } from "../../app/routes";
import { renderWithProviders } from "../../test/render";

const MOCK_VIEWPORT = { viewportWidth: 1200, viewportHeight: 800, itemWidth: 184, itemHeight: 208 };

// Untyped fixtures on purpose: later plans add response fields.
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

function makeItems(count: number, prefix = "img") {
  return Array.from({ length: count }, (_, i) => ({
    id: i + 1,
    filename: `${prefix}-${i + 1}.jpg`,
    width: 640,
    height: 480,
    size_bytes: 1000,
    created_at: "2026-01-01T00:00:00Z",
  }));
}

interface ListQuery {
  sort: string | null;
  q: string | null;
}

/** Records every image-list request; the editor's own GETs answer 404 so navigation never throws. */
function stubFetch() {
  const requests: ListQuery[] = [];
  const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
    const url = new URL(String(input), "http://localhost");
    if (url.pathname.endsWith("/config")) {
      return jsonResponse(CONFIG);
    }
    if (url.pathname.endsWith("/projects/7/images")) {
      requests.push({ sort: url.searchParams.get("sort"), q: url.searchParams.get("q") });
      const q = url.searchParams.get("q");
      return jsonResponse({
        items: makeItems(4, q ?? "img"),
        next_cursor: null,
        total: 4,
      });
    }
    if (url.pathname.endsWith("/projects/7")) {
      return jsonResponse(PROJECT);
    }
    if (url.pathname.includes("/projects/7/images/") || url.pathname.endsWith("/classes")) {
      return jsonResponse({ detail: "Not found." }, 404);
    }
    throw new Error(`Unexpected request: ${url.pathname}`);
  });
  vi.stubGlobal("fetch", fetchMock);
  return requests;
}

function LocationProbe() {
  const location = useLocation();
  const navigationType = useNavigationType();
  return (
    <>
      <div data-testid="navigation-type">{navigationType}</div>
      <div data-testid="pathname">{location.pathname}</div>
      <div data-testid="search">{location.search}</div>
    </>
  );
}

function renderAt(route: string) {
  return renderWithProviders(
    <VirtuosoGridMockContext.Provider value={MOCK_VIEWPORT}>
      <AppRoutes />
      <LocationProbe />
    </VirtuosoGridMockContext.Provider>,
    { route },
  );
}

function lastRequest(requests: ListQuery[]): ListQuery {
  return requests[requests.length - 1] as ListQuery;
}

describe("Images page keeps sort and search in the URL", () => {
  it("restores sort and search from the URL on load", async () => {
    const requests = stubFetch();

    renderAt("/projects/7/images?sort=name&q=cat");

    expect(await screen.findByText("cat-1.jpg")).toBeInTheDocument();
    expect(requests[0]).toEqual({ sort: "name", q: "cat" });
    expect(screen.getByRole("textbox", { name: "Search by filename" })).toHaveValue("cat");
    // Mantine's SegmentedControl marks the chosen option through its radio input.
    expect(screen.getByRole("radio", { name: "By filename" })).toBeChecked();
  });

  it("drops sort from the URL when newest is chosen again and keeps q", async () => {
    stubFetch();
    const { user } = renderAt("/projects/7/images?sort=name&q=cat");
    await screen.findByText("cat-1.jpg");

    await user.click(screen.getByText("Newest first"));

    await waitFor(() => expect(screen.getByTestId("search")).toHaveTextContent(/^\?q=cat$/));
  });

  it("writes the debounced search into the URL next to the sort", async () => {
    const requests = stubFetch();
    const { user } = renderAt("/projects/7/images?sort=name&q=cat");
    await screen.findByText("cat-1.jpg");

    const input = screen.getByRole("textbox", { name: "Search by filename" });
    await user.clear(input);
    await user.type(input, "dog");

    await waitFor(() => expect(screen.getByTestId("search")).toHaveTextContent(/^\?sort=name&q=dog$/));
    expect(lastRequest(requests)).toEqual({ sort: "name", q: "dog" });
  });

  it("omits sort and q from the URL when they are the defaults", async () => {
    stubFetch();
    const { user } = renderAt("/projects/7/images?sort=name&q=cat");
    await screen.findByText("cat-1.jpg");

    await user.click(screen.getByRole("button", { name: "Clear" }));
    await user.click(screen.getByText("Newest first"));

    await waitFor(() => expect(screen.getByTestId("search")).toHaveTextContent(/^$/));
  });

  it("falls back to newest for an unknown sort value", async () => {
    const requests = stubFetch();

    renderAt("/projects/7/images?sort=bogus");

    expect(await screen.findByText("img-1.jpg")).toBeInTheDocument();
    expect(requests[0]).toEqual({ sort: "newest", q: null });
  });

  it("never sends or writes a search longer than the server limit", async () => {
    const requests = stubFetch();
    const long = "a".repeat(300);

    renderAt(`/projects/7/images?q=${long}`);

    await waitFor(() => expect(requests.length).toBeGreaterThan(0));
    expect(requests[0]?.q).toBe("a".repeat(255));
    expect(requests.every((request) => (request.q ?? "").length <= 255)).toBe(true);
    // The page rewrites the oversized URL it was opened with to the capped search.
    await waitFor(() =>
      expect(screen.getByTestId("search").textContent ?? "").not.toContain("a".repeat(256)),
    );
  });

  it("opens the editor on a tile click and carries the grid's sort and search", async () => {
    stubFetch();
    const { user } = renderAt("/projects/7/images?sort=name&q=cat");
    await screen.findByText("cat-1.jpg");

    await user.click(screen.getByRole("button", { name: "cat-2.jpg" }));

    await waitFor(() =>
      expect(screen.getByTestId("pathname")).toHaveTextContent("/projects/7/annotate/2"),
    );
    expect(screen.getByTestId("search")).toHaveTextContent(/^\?sort=name&q=cat$/);
  });

  it("opens the editor without params when the grid shows the defaults", async () => {
    stubFetch();
    const { user } = renderAt("/projects/7/images");
    await screen.findByText("img-1.jpg");

    await user.click(screen.getByRole("button", { name: "img-4.jpg" }));

    await waitFor(() =>
      expect(screen.getByTestId("pathname")).toHaveTextContent("/projects/7/annotate/4"),
    );
    expect(screen.getByTestId("search")).toHaveTextContent(/^$/);
  });

  it("writes the URL with replace, so typing and sorting never add history entries", async () => {
    stubFetch();
    const { user } = renderAt("/projects/7/images");
    await screen.findByText("img-1.jpg");

    await user.type(screen.getByRole("textbox", { name: "Search by filename" }), "cat");
    await waitFor(() => expect(screen.getByTestId("search")).toHaveTextContent(/^\?q=cat$/));
    expect(screen.getByTestId("navigation-type")).toHaveTextContent("REPLACE");

    await user.click(screen.getByText("By filename"));
    await waitFor(() =>
      expect(screen.getByTestId("search")).toHaveTextContent(/^\?sort=name&q=cat$/),
    );
    expect(screen.getByTestId("navigation-type")).toHaveTextContent("REPLACE");
  });
});
