import { screen, waitFor } from "@testing-library/react";
import { useLocation } from "react-router-dom";
import { VirtuosoGridMockContext } from "react-virtuoso";
import { describe, expect, it, vi } from "vitest";

vi.mock("@mantine/notifications", () => ({
  notifications: { show: vi.fn() },
}));

import { notifications } from "@mantine/notifications";

import type { StatusCounts } from "../../api/images";
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
  image_count: 5,
  class_count: 1,
};

const CONFIG = {
  max_upload_mb: 50,
  max_upload_bytes: 50_000_000,
  accepted_extensions: ["jpg", "jpeg", "png", "webp", "bmp"],
};

const COUNTS: StatusCounts = { total: 5, unannotated: 3, annotated: 1, reviewed: 1, background: 0 };

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

type NextMode = { image_id: number | null; hold?: boolean } | { error: string };

interface StubOptions {
  counts?: Partial<StatusCounts>;
  /** The status-counts request fails with a 500. */
  countsFail?: boolean;
  /** How many images the list holds (0 shows the project's empty state). */
  items?: number;
  next?: NextMode;
}

/** Project, config, a list, status counts and the next-unannotated lookup. */
function stubFetch({ counts = COUNTS, countsFail = false, items = 5, next = { image_id: 42 } }: StubOptions = {}) {
  const nextRequests: URLSearchParams[] = [];
  const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
    const url = new URL(String(input), "http://localhost");
    if (url.pathname.endsWith("/images/status-counts") && countsFail) {
      return jsonResponse({ detail: "Counts are unavailable." }, 500);
    }
    if (url.pathname.endsWith("/images/next-unannotated")) {
      nextRequests.push(url.searchParams);
      if ("error" in next) {
        return jsonResponse({ detail: next.error }, 500);
      }
      if (next.hold) {
        return new Promise<Response>(() => undefined);
      }
      return jsonResponse({ image_id: next.image_id });
    }
    const side = handleImagesSideRequest(url, { counts });
    if (side !== null) {
      return side;
    }
    if (url.pathname.endsWith("/config")) {
      return jsonResponse(CONFIG);
    }
    if (url.pathname.endsWith("/projects/7/images")) {
      return jsonResponse({
        items: Array.from({ length: items }, (_, i) => makeImageItem({ id: i + 1 })),
        next_cursor: null,
        total: items,
      });
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
  return { fetchMock, nextRequests };
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

function renderAt(route: string) {
  return renderWithProviders(
    <VirtuosoGridMockContext.Provider value={MOCK_VIEWPORT}>
      <AppRoutes />
      <LocationProbe />
    </VirtuosoGridMockContext.Provider>,
    { route },
  );
}

async function settle() {
  await new Promise((resolve) => setTimeout(resolve, 50));
}

describe("Annotate next", () => {
  it("is the filled primary action, and Upload images steps back to default", async () => {
    stubFetch();
    renderAt("/projects/7/images");

    const annotate = await screen.findByRole("button", { name: "Annotate next" });
    // Mantine sets data-variant only for a non-default variant; no attribute means filled.
    expect(annotate).not.toHaveAttribute("data-variant");
    expect(annotate).toBeEnabled();
    expect(screen.getByRole("button", { name: "Upload images" })).toHaveAttribute(
      "data-variant",
      "default",
    );
  });

  it("sits left of the upload buttons", async () => {
    stubFetch();
    renderAt("/projects/7/images");

    const annotate = await screen.findByRole("button", { name: "Annotate next" });
    const upload = screen.getByRole("button", { name: "Upload images" });
    expect(annotate.compareDocumentPosition(upload) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });

  it("looks up the first unannotated image in the grid's sort and search, then opens the editor", async () => {
    const { nextRequests } = stubFetch();
    const { user } = renderAt("/projects/7/images?sort=name&q=a");

    await user.click(await screen.findByRole("button", { name: "Annotate next" }));

    await waitFor(() =>
      expect(screen.getByTestId("pathname")).toHaveTextContent("/projects/7/annotate/42"),
    );
    expect(screen.getByTestId("search")).toHaveTextContent(/^\?sort=name&q=a$/);
    expect(nextRequests).toHaveLength(1);
    expect(nextRequests[0]?.get("sort")).toBe("name");
    expect(nextRequests[0]?.get("q")).toBe("a");
    expect(nextRequests[0]?.has("after")).toBe(false);
  });

  it("opens the editor without params when the grid shows the defaults", async () => {
    const { nextRequests } = stubFetch();
    const { user } = renderAt("/projects/7/images");

    await user.click(await screen.findByRole("button", { name: "Annotate next" }));

    await waitFor(() =>
      expect(screen.getByTestId("pathname")).toHaveTextContent("/projects/7/annotate/42"),
    );
    expect(screen.getByTestId("search")).toHaveTextContent(/^$/);
    expect(nextRequests[0]?.get("sort")).toBe("newest");
    expect(nextRequests[0]?.has("q")).toBe(false);
  });

  it("shows a loading state while the lookup runs", async () => {
    stubFetch({ next: { image_id: 42, hold: true } });
    const { user } = renderAt("/projects/7/images");

    await user.click(await screen.findByRole("button", { name: "Annotate next" }));

    await waitFor(() =>
      expect(screen.getByRole("button", { name: "Annotate next" })).toHaveAttribute("data-loading"),
    );
    expect(screen.getByTestId("pathname")).toHaveTextContent("/projects/7/images");
  });

  it("is disabled when no image is left unannotated", async () => {
    stubFetch({ counts: { total: 5, unannotated: 0, annotated: 4, reviewed: 1, background: 0 } });
    renderAt("/projects/7/images");

    await screen.findByText(/All images are annotated\./);
    expect(screen.getByRole("button", { name: "Annotate next" })).toBeDisabled();
  });

  it("tells the user when the server finds nothing left (a race) and does not navigate", async () => {
    stubFetch({ next: { image_id: null } });
    const { user } = renderAt("/projects/7/images");

    await user.click(await screen.findByRole("button", { name: "Annotate next" }));

    await waitFor(() =>
      expect(notifications.show).toHaveBeenCalledWith(
        expect.objectContaining({ color: "green", message: "All images are annotated." }),
      ),
    );
    expect(screen.getByTestId("pathname")).toHaveTextContent("/projects/7/images");
  });

  it("shows the API message in a red notification when the lookup fails", async () => {
    stubFetch({ next: { error: "Boom." } });
    const { user } = renderAt("/projects/7/images");

    await user.click(await screen.findByRole("button", { name: "Annotate next" }));

    await waitFor(() =>
      expect(notifications.show).toHaveBeenCalledWith(
        expect.objectContaining({ color: "red", message: "Boom." }),
      ),
    );
    expect(screen.getByTestId("pathname")).toHaveTextContent("/projects/7/images");
  });

  it("still works when the status counts fail to load", async () => {
    stubFetch({ countsFail: true });
    const { user } = renderAt("/projects/7/images");

    const annotate = await screen.findByRole("button", { name: "Annotate next" });
    expect(annotate).toBeEnabled();
    expect(screen.queryByTestId("status-summary")).not.toBeInTheDocument();
    await user.click(annotate);

    await waitFor(() =>
      expect(screen.getByTestId("pathname")).toHaveTextContent("/projects/7/annotate/42"),
    );
  });

  it("is absent for a project without images, and Upload images stays filled", async () => {
    stubFetch({ counts: { total: 0 }, items: 0 });
    renderAt("/projects/7/images");

    expect(await screen.findByText("No images yet")).toBeInTheDocument();
    await settle();
    expect(screen.queryByRole("button", { name: "Annotate next" })).not.toBeInTheDocument();
    const uploads = screen.getAllByRole("button", { name: "Upload images" });
    expect(uploads.length).toBeGreaterThanOrEqual(2);
    for (const button of uploads) {
      expect(button).not.toHaveAttribute("data-variant");
    }
  });

  it("speaks Russian", async () => {
    stubFetch();
    renderWithProviders(
      <VirtuosoGridMockContext.Provider value={MOCK_VIEWPORT}>
        <AppRoutes />
      </VirtuosoGridMockContext.Provider>,
      { route: "/projects/7/images", language: "ru" },
    );

    expect(await screen.findByRole("button", { name: "Разметить следующее" })).toBeInTheDocument();
  });
});
