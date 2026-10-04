import { screen, waitFor } from "@testing-library/react";
import { VirtuosoGridMockContext } from "react-virtuoso";
import { describe, expect, it, vi } from "vitest";

import type { StatusCounts } from "../../api/images";
import { AppRoutes } from "../../app/routes";
import { makeImageItem } from "../../test/fixtures";
import { renderWithProviders } from "../../test/render";
import { handleImagesSideRequest } from "../../test/stubImagesApi";
import { StatusSummary } from "./StatusSummary";

const MOCK_VIEWPORT = { viewportWidth: 1200, viewportHeight: 800, itemWidth: 184, itemHeight: 208 };

const PROJECT = {
  id: 7,
  name: "Cars",
  task_type: "detect",
  description: null,
  created_at: "2026-01-01T00:00:00Z",
  updated_at: "2026-01-01T00:00:00Z",
  image_count: 10,
  class_count: 1,
};

const CONFIG = {
  max_upload_mb: 50,
  max_upload_bytes: 50_000_000,
  accepted_extensions: ["jpg", "jpeg", "png", "webp", "bmp"],
};

const COUNTS: StatusCounts = { total: 10, unannotated: 4, annotated: 4, reviewed: 2, background: 1 };

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

type CountsMode = "ok" | "pending" | "error";

/** Project, config, a 3-image list and the status counts the test asks for. */
function stubFetch(counts: Partial<StatusCounts> = COUNTS, mode: CountsMode = "ok") {
  const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
    const url = new URL(String(input), "http://localhost");
    if (url.pathname.endsWith("/images/status-counts")) {
      if (mode === "pending") {
        return new Promise<Response>(() => undefined);
      }
      if (mode === "error") {
        return jsonResponse({ detail: "Counts are unavailable." }, 500);
      }
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
        items: [1, 2, 3].map((id) => makeImageItem({ id })),
        next_cursor: null,
        total: 3,
      });
    }
    if (url.pathname.endsWith("/projects/7")) {
      return jsonResponse(PROJECT);
    }
    throw new Error(`Unexpected request: ${url.pathname}`);
  });
  vi.stubGlobal("fetch", fetchMock);
  return fetchMock;
}

function countsCalls(fetchMock: ReturnType<typeof stubFetch>) {
  return fetchMock.mock.calls.filter((call) => String(call[0]).endsWith("/images/status-counts"));
}

/** Gives a request that must change nothing the time to (not) change it. */
async function settle() {
  await new Promise((resolve) => setTimeout(resolve, 50));
}

describe("StatusSummary", () => {
  it("reads annotated of total, counting reviewed and background as annotated, then reviewed", async () => {
    stubFetch();
    renderWithProviders(<StatusSummary projectId={7} />);

    const row = await screen.findByTestId("status-summary");
    expect(row).toHaveTextContent(/^Annotated: 6 of 10 · Reviewed: 2$/);
    expect(row).not.toHaveTextContent("All images are annotated.");
  });

  it("ends with 'All images are annotated.' when no image is left unannotated", async () => {
    stubFetch({ total: 10, unannotated: 0, annotated: 6, reviewed: 3, background: 1 });
    renderWithProviders(<StatusSummary projectId={7} />);

    const row = await screen.findByTestId("status-summary");
    expect(row).toHaveTextContent(
      /^Annotated: 10 of 10 · Reviewed: 3 · All images are annotated\.$/,
    );
  });

  it("formats the numbers for the active language", async () => {
    stubFetch({ total: 12345, unannotated: 345, annotated: 12000, reviewed: 1200, background: 0 });
    renderWithProviders(<StatusSummary projectId={7} />);

    expect(await screen.findByTestId("status-summary")).toHaveTextContent(
      "Annotated: 12,000 of 12,345 · Reviewed: 1,200",
    );
  });

  it("speaks Russian", async () => {
    stubFetch();
    renderWithProviders(<StatusSummary projectId={7} />, { language: "ru" });

    expect(await screen.findByTestId("status-summary")).toHaveTextContent(
      /^Размечено: 6 из 10 · Проверено: 2$/,
    );
  });

  it("renders the Russian all-done sentence after the reviewed count", async () => {
    stubFetch({ total: 3, unannotated: 0, annotated: 2, reviewed: 1, background: 0 });
    renderWithProviders(<StatusSummary projectId={7} />, { language: "ru" });

    expect(await screen.findByTestId("status-summary")).toHaveTextContent(
      /^Размечено: 3 из 3 · Проверено: 1 · Все изображения размечены\.$/,
    );
  });

  it("uses tabular figures and wraps instead of truncating", async () => {
    stubFetch();
    renderWithProviders(<StatusSummary projectId={7} />);

    const row = await screen.findByTestId("status-summary");
    expect(row.style.fontVariantNumeric).toBe("tabular-nums");
    expect(row.style.getPropertyValue("--group-wrap")).toBe("wrap");
  });

  it("renders nothing for a project without images", async () => {
    const fetchMock = stubFetch({ total: 0 });
    renderWithProviders(<StatusSummary projectId={7} />);

    await waitFor(() => expect(countsCalls(fetchMock)).toHaveLength(1));
    await settle();
    expect(screen.queryByTestId("status-summary")).not.toBeInTheDocument();
  });

  it("renders nothing while the counts are still loading", async () => {
    const fetchMock = stubFetch(COUNTS, "pending");
    renderWithProviders(<StatusSummary projectId={7} />);

    await waitFor(() => expect(countsCalls(fetchMock)).toHaveLength(1));
    await settle();
    expect(screen.queryByTestId("status-summary")).not.toBeInTheDocument();
  });

  it("renders nothing, and no error text, when the counts request fails", async () => {
    const fetchMock = stubFetch(COUNTS, "error");
    renderWithProviders(<StatusSummary projectId={7} />);

    await waitFor(() => expect(countsCalls(fetchMock)).toHaveLength(1));
    await settle();
    expect(screen.queryByTestId("status-summary")).not.toBeInTheDocument();
    expect(screen.queryByText("Counts are unavailable.")).not.toBeInTheDocument();
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  });
});

describe("StatusSummary on the Images page", () => {
  function renderImagesPage(route: string) {
    return renderWithProviders(
      <VirtuosoGridMockContext.Provider value={MOCK_VIEWPORT}>
        <AppRoutes />
      </VirtuosoGridMockContext.Provider>,
      { route },
    );
  }

  it("sits under the title row and ignores the search (project-wide counts)", async () => {
    const fetchMock = stubFetch();
    renderImagesPage("/projects/7/images?q=img");

    const row = await screen.findByTestId("status-summary");
    const title = screen.getByRole("heading", { name: "Images" });
    expect(title.compareDocumentPosition(row) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    const calls = countsCalls(fetchMock);
    expect(calls.length).toBeGreaterThan(0);
    for (const call of calls) {
      expect(String(call[0])).toBe("/api/projects/7/images/status-counts");
    }
  });

  it("is absent when the counts say the project has no images", async () => {
    stubFetch({ total: 0 });
    renderImagesPage("/projects/7/images");

    await screen.findByText("img-1.jpg");
    await settle();
    expect(screen.queryByTestId("status-summary")).not.toBeInTheDocument();
  });
});
