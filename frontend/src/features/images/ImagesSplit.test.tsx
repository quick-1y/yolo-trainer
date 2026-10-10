import { screen, waitFor, within } from "@testing-library/react";
import type { UserEvent } from "@testing-library/user-event";
import { VirtuosoGridMockContext } from "react-virtuoso";
import { describe, expect, it, vi } from "vitest";

vi.mock("@mantine/notifications", () => ({
  notifications: { show: vi.fn() },
}));

import { notifications } from "@mantine/notifications";

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
  return Array.from({ length: count }, (_, i) =>
    makeImageItem({ id: i + 1, filename: `img-${i + 1}.jpg` }),
  );
}

interface SplitBody {
  ids: number[];
  split: string | null;
}

type SplitHandler = (call: number, body: SplitBody) => Response | Promise<Response>;

/** Strict stub: project, config, an N-image list and the split route. */
function stubFetch(onSplit: SplitHandler) {
  const count = 10;
  const bodies: SplitBody[] = [];
  const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = new URL(String(input), "http://localhost");
    const side = handleImagesSideRequest(url);
    if (side !== null) {
      return side;
    }
    const method = init?.method ?? "GET";
    if (url.pathname.endsWith("/config")) {
      return jsonResponse(CONFIG);
    }
    if (url.pathname.endsWith("/projects/7/images/split") && method === "POST") {
      const body = JSON.parse(String(init?.body)) as SplitBody;
      bodies.push(body);
      return onSplit(bodies.length - 1, body);
    }
    if (url.pathname.endsWith("/projects/7/images")) {
      return jsonResponse({ items: makeItems(count), next_cursor: null, total: count });
    }
    if (url.pathname.endsWith("/projects/7")) {
      return jsonResponse(PROJECT);
    }
    throw new Error(`Unexpected request: ${method} ${url.pathname}`);
  });
  vi.stubGlobal("fetch", fetchMock);
  return { fetchMock, bodies };
}

function callsTo(fetchMock: ReturnType<typeof stubFetch>["fetchMock"], suffix: string) {
  return fetchMock.mock.calls.filter((call) => String(call[0]).endsWith(suffix));
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

// Plain text and label queries instead of getByRole: the accessible-name computation is slow
// in jsdom, and these tests share a busy worker pool with the editor suites.
function checkbox(index: number): HTMLElement {
  return screen.getByLabelText(`Select img-${index}.jpg`);
}

function tile(index: number): HTMLElement {
  const element = screen.getByText(`img-${index}.jpg`).closest<HTMLElement>('[role="button"]');
  if (element === null) {
    throw new Error(`No tile for img-${index}.jpg`);
  }
  return element;
}

function setSplitTrigger(): HTMLElement {
  const element = screen.getByText("Set split").closest<HTMLElement>("button");
  if (element === null) {
    throw new Error("No Set split button");
  }
  return element;
}

const menuLabel = (name: string) =>
  screen.findByText(name, { selector: ".mantine-Menu-itemLabel" });

async function openSplitMenu(user: UserEvent) {
  await user.click(setSplitTrigger());
}

async function chooseSplit(user: UserEvent, name: string) {
  await openSplitMenu(user);
  await user.click(await menuLabel(name));
}

describe("selection bar split action", () => {
  it("lists the count, Clear selection, Set split and Delete in that order", async () => {
    stubFetch(() => jsonResponse({ updated: 0 }));
    const { user } = await renderGrid();

    await user.click(checkbox(1));
    await user.click(checkbox(2));

    const count = await screen.findByText("Selected: 2");
    const clear = screen.getByRole("button", { name: "Clear selection" });
    const setSplit = setSplitTrigger();
    const remove = screen.getByRole("button", { name: "Delete" });
    const follows = (a: HTMLElement, b: HTMLElement) =>
      Boolean(a.compareDocumentPosition(b) & Node.DOCUMENT_POSITION_FOLLOWING);
    expect(follows(count, clear)).toBe(true);
    expect(follows(clear, setSplit)).toBe(true);
    expect(follows(setSplit, remove)).toBe(true);
    expect(count).toHaveStyle({ fontWeight: "600" });
  });

  it("offers Train, Valid, Test and No split in the menu", async () => {
    stubFetch(() => jsonResponse({ updated: 0 }));
    const { user } = await renderGrid();
    await user.click(checkbox(1));

    await openSplitMenu(user);

    await menuLabel("No split");
    const items = Array.from(document.querySelectorAll('[role="menuitem"]'));
    expect(items.map((item) => item.textContent)).toEqual(["Train", "Valid", "Test", "No split"]);
  });

  it("sends one request with both ids, reports it, clears the selection and patches the tiles", async () => {
    const { fetchMock, bodies } = stubFetch((_call, body) => jsonResponse({ updated: body.ids.length }));
    const { user } = await renderGrid();
    await user.click(checkbox(1));
    await user.click(checkbox(2));
    const listGetsBefore = callsTo(fetchMock, "/projects/7/images").length;
    const countGetsBefore = callsTo(fetchMock, "/images/status-counts").length;

    await chooseSplit(user, "Valid");

    await waitFor(() => expect(bodies).toHaveLength(1));
    expect([...bodies[0].ids].sort()).toEqual([1, 2]);
    expect(bodies[0].split).toBe("valid");
    await waitFor(() =>
      expect(notifications.show).toHaveBeenCalledWith({
        color: "green",
        message: "Images updated: 2. Split: Valid.",
      }),
    );
    await waitFor(() => expect(screen.queryByText("Selected: 2")).not.toBeInTheDocument());
    expect(within(tile(1)).getByLabelText("Split: Valid")).toHaveTextContent("Valid");
    expect(within(tile(2)).getByLabelText("Split: Valid")).toHaveTextContent("Valid");
    expect(within(tile(3)).queryByLabelText(/^Split:/)).toBeNull();
    // the loaded list is patched in place, not refetched; the split counts are
    expect(callsTo(fetchMock, "/projects/7/images")).toHaveLength(listGetsBefore);
    await waitFor(() =>
      expect(callsTo(fetchMock, "/images/status-counts").length).toBeGreaterThan(countGetsBefore),
    );
  });

  it("sends split null for No split", async () => {
    const { bodies } = stubFetch((_call, body) => jsonResponse({ updated: body.ids.length }));
    const { user } = await renderGrid();
    await user.click(checkbox(3));

    await chooseSplit(user, "No split");

    await waitFor(() => expect(bodies).toHaveLength(1));
    expect(bodies[0]).toEqual({ ids: [3], split: null });
    await waitFor(() =>
      expect(notifications.show).toHaveBeenCalledWith({
        color: "green",
        message: "Images updated: 1. Split: No split.",
      }),
    );
  });

  it("disables the trigger and shows a loader while the request runs", async () => {
    let release: (response: Response) => void = () => undefined;
    stubFetch(
      () =>
        new Promise<Response>((resolve) => {
          release = resolve;
        }),
    );
    const { user } = await renderGrid();
    await user.click(checkbox(1));

    await chooseSplit(user, "Train");

    const trigger = setSplitTrigger();
    await waitFor(() => expect(trigger).toBeDisabled());
    expect(trigger).toHaveAttribute("data-loading", "true");
    release(jsonResponse({ updated: 1 }));
    await waitFor(() => expect(screen.queryByText("Set split")).toBeNull());
  });

  it("reports a failed request and keeps the selection", async () => {
    stubFetch(() => jsonResponse({ detail: "Database is busy." }, 500));
    const { user } = await renderGrid();
    await user.click(checkbox(1));
    await user.click(checkbox(2));

    await chooseSplit(user, "Test");

    await waitFor(() =>
      expect(notifications.show).toHaveBeenCalledWith({
        color: "red",
        message: "Updated: 0 of 2 images. Database is busy.",
      }),
    );
    expect(screen.getByText("Selected: 2")).toBeInTheDocument();
    expect(within(tile(1)).queryByLabelText(/^Split:/)).toBeNull();
  });
});
