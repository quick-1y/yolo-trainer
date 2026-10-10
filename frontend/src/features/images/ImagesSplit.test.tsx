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
// One column tall enough for every tile of a 1001-image list.
const TALL_VIEWPORT = { viewportWidth: 184, viewportHeight: 208 * 1100, itemWidth: 184, itemHeight: 208 };

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
function stubFetch(onSplit: SplitHandler, count = 10) {
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

async function renderGrid(viewport = MOCK_VIEWPORT, lastName = "img-1.jpg") {
  const rendered = renderWithProviders(
    <VirtuosoGridMockContext.Provider value={viewport}>
      <AppRoutes />
    </VirtuosoGridMockContext.Provider>,
    { route: "/projects/7/images" },
  );
  await screen.findByText(lastName);
  return rendered;
}

function checkbox(index: number): HTMLElement {
  return screen.getByRole("checkbox", { name: `Select img-${index}.jpg` });
}

function tile(index: number): HTMLElement {
  return screen.getByRole("button", { name: new RegExp(`^img-${index}\\.jpg,`) });
}

async function openSplitMenu(user: UserEvent) {
  await user.click(screen.getByRole("button", { name: /Set split/ }));
}

async function chooseSplit(user: UserEvent, name: string) {
  await openSplitMenu(user);
  await user.click(await screen.findByRole("menuitem", { name }));
}

async function shiftClick(user: UserEvent, element: HTMLElement) {
  await user.keyboard("{Shift>}");
  await user.click(element);
  await user.keyboard("{/Shift}");
}

describe("selection bar split action", () => {
  it("lists the count, Clear selection, Set split and Delete in that order", async () => {
    stubFetch(() => jsonResponse({ updated: 0 }));
    const { user } = await renderGrid();

    await user.click(checkbox(1));
    await user.click(checkbox(2));

    const count = await screen.findByText("Selected: 2");
    const clear = screen.getByRole("button", { name: "Clear selection" });
    const setSplit = screen.getByRole("button", { name: /Set split/ });
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

    const items = await screen.findAllByRole("menuitem");
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

    const trigger = await screen.findByRole("button", { name: /Set split/ });
    await waitFor(() => expect(trigger).toBeDisabled());
    expect(trigger).toHaveAttribute("data-loading", "true");
    release(jsonResponse({ updated: 1 }));
    await waitFor(() => expect(screen.queryByRole("button", { name: /Set split/ })).toBeNull());
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

describe("selection over one batch", () => {
  const COUNT = 1001;

  async function selectAll(user: UserEvent) {
    await user.click(checkbox(1));
    await shiftClick(user, checkbox(COUNT));
    expect(await screen.findByText(`Selected: ${COUNT}`)).toBeInTheDocument();
  }

  it("sends two sequential requests of 1000 and 1 ids", async () => {
    let inFlight = 0;
    let maxInFlight = 0;
    const { bodies } = stubFetch(async (_call, body) => {
      inFlight += 1;
      maxInFlight = Math.max(maxInFlight, inFlight);
      await new Promise((resolve) => setTimeout(resolve, 10));
      inFlight -= 1;
      return jsonResponse({ updated: body.ids.length });
    }, COUNT);
    const { user } = await renderGrid(TALL_VIEWPORT, `img-${COUNT}.jpg`);
    await selectAll(user);

    await chooseSplit(user, "Train");

    await waitFor(() => expect(bodies).toHaveLength(2), { timeout: 20000 });
    expect(bodies.map((body) => body.ids.length)).toEqual([1000, 1]);
    expect(maxInFlight).toBe(1);
    await waitFor(() =>
      expect(notifications.show).toHaveBeenCalledWith({
        color: "green",
        message: "Images updated: 1,001. Split: Train.",
      }),
    );
  }, 60000);

  it("reports the updated prefix when the second chunk fails and keeps the selection", async () => {
    stubFetch(
      (call, body) =>
        call === 0
          ? jsonResponse({ updated: body.ids.length })
          : jsonResponse({ detail: "Database is busy." }, 500),
      COUNT,
    );
    const { user } = await renderGrid(TALL_VIEWPORT, `img-${COUNT}.jpg`);
    await selectAll(user);

    await chooseSplit(user, "Valid");

    await waitFor(
      () =>
        expect(notifications.show).toHaveBeenCalledWith({
          color: "red",
          message: "Updated: 1000 of 1001 images. Database is busy.",
        }),
      { timeout: 20000 },
    );
    expect(screen.getByText(`Selected: ${COUNT}`)).toBeInTheDocument();
    expect(within(tile(1)).getByLabelText("Split: Valid")).toBeInTheDocument();
    expect(within(tile(1000)).getByLabelText("Split: Valid")).toBeInTheDocument();
    expect(within(tile(COUNT)).queryByLabelText(/^Split:/)).toBeNull();
  }, 60000);
});
