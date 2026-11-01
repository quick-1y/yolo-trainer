import { screen, waitFor, within } from "@testing-library/react";
import type { UserEvent } from "@testing-library/user-event";
import { VirtuosoGridMockContext } from "react-virtuoso";
import { beforeEach, describe, expect, it, vi } from "vitest";

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
  id: 1,
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

const DRIFT = "The set of unassigned images changed. Review the split again.";

interface Ratios {
  train: number;
  valid: number;
  test: number;
}

interface ApplyBody extends Ratios {
  seed: number;
  expected_unassigned: number;
}

interface Preview {
  seed: number;
  unassigned_total: number;
  counts: Ratios;
}

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

interface StubOptions {
  /** Images in the project; zero shows the empty state. */
  total?: number;
  /** Images without a split, as the status counts report them. */
  none?: number;
  onPreview?: (call: number, body: Ratios) => Response | Promise<Response>;
  onApply?: (call: number, body: ApplyBody) => Response | Promise<Response>;
}

const DEFAULT_PREVIEW: Preview = {
  seed: 123,
  unassigned_total: 7,
  counts: { train: 5, valid: 1, test: 1 },
};

/** Strict stub: project, config, an image list, the status counts and both auto-split routes. */
function stubFetch({ total = 10, none = 7, onPreview, onApply }: StubOptions = {}) {
  const previews: Ratios[] = [];
  const applies: ApplyBody[] = [];
  const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = new URL(String(input), "http://localhost");
    const side = handleImagesSideRequest(url, {
      counts: { total, splits: { train: 0, valid: 0, test: 0, none } },
    });
    if (side !== null) {
      return side;
    }
    const method = init?.method ?? "GET";
    if (url.pathname.endsWith("/config")) {
      return jsonResponse(CONFIG);
    }
    if (url.pathname.endsWith("/projects/1/splits/auto/preview") && method === "POST") {
      const body = JSON.parse(String(init?.body)) as Ratios;
      previews.push(body);
      return onPreview
        ? onPreview(previews.length - 1, body)
        : jsonResponse({ ...DEFAULT_PREVIEW, unassigned_total: none });
    }
    if (url.pathname.endsWith("/projects/1/splits/auto") && method === "POST") {
      const body = JSON.parse(String(init?.body)) as ApplyBody;
      applies.push(body);
      return onApply
        ? onApply(applies.length - 1, body)
        : jsonResponse({ counts: DEFAULT_PREVIEW.counts });
    }
    if (url.pathname.endsWith("/projects/1/images")) {
      return jsonResponse({ items: makeItems(total), next_cursor: null, total });
    }
    if (url.pathname.endsWith("/projects/1")) {
      return jsonResponse(PROJECT);
    }
    throw new Error(`Unexpected request: ${method} ${url.pathname}`);
  });
  vi.stubGlobal("fetch", fetchMock);
  return { fetchMock, previews, applies };
}

function callsTo(fetchMock: ReturnType<typeof stubFetch>["fetchMock"], suffix: string) {
  // By pathname: the image list request carries a query string (sort, limit).
  return fetchMock.mock.calls.filter((call) =>
    new URL(String(call[0]), "http://localhost").pathname.endsWith(suffix),
  );
}

async function renderPage(language = "en") {
  const rendered = renderWithProviders(
    <VirtuosoGridMockContext.Provider value={MOCK_VIEWPORT}>
      <AppRoutes />
    </VirtuosoGridMockContext.Provider>,
    { route: "/projects/1/images", language },
  );
  return rendered;
}

function button(text: string): HTMLElement {
  const element = screen.getByText(text).closest<HTMLElement>("button");
  if (element === null) {
    throw new Error(`No button "${text}"`);
  }
  return element;
}

async function openDialog(user: UserEvent, opener = "Split dataset") {
  await screen.findByText("img-1.jpg");
  await waitFor(() => expect(button(opener)).not.toHaveAttribute("data-disabled"));
  await user.click(button(opener));
  return screen.findByText("Split dataset automatically");
}

/** Replace a ratio input's text; typing digits goes through the same path as a user. */
async function setRatio(user: UserEvent, label: string, value: string) {
  const input = screen.getByLabelText(label);
  await user.clear(input);
  if (value !== "") {
    await user.type(input, value);
  }
}

beforeEach(() => {
  vi.mocked(notifications.show).mockClear();
});

describe("Split dataset opener on the Images page", () => {
  it("is absent when the project has no images", async () => {
    stubFetch({ total: 0, none: 0 });
    await renderPage();

    await screen.findByText("No images yet");

    expect(screen.queryByText("Split dataset")).toBeNull();
  });

  it("is disabled with a tooltip when every image already has a split", async () => {
    stubFetch({ none: 0 });
    const { user } = await renderPage();
    await screen.findByText("img-1.jpg");
    await screen.findByText("Split dataset");
    const opener = button("Split dataset");

    await waitFor(() => expect(opener).toHaveAttribute("data-disabled"));
    await user.hover(opener);
    await screen.findByText("All images already have a split.");
    await user.click(opener);

    expect(screen.queryByText("Split dataset automatically")).toBeNull();
  });

  it("is enabled when some image has no split and sits between Annotate next and Upload", async () => {
    stubFetch({ none: 7 });
    await renderPage();
    await screen.findByText("img-1.jpg");
    await screen.findByText("Annotate next");
    await screen.findByText("Split dataset");

    const next = button("Annotate next");
    const split = button("Split dataset");
    const upload = button("Upload images");

    expect(split).not.toHaveAttribute("data-disabled");
    const follows = (a: HTMLElement, b: HTMLElement) =>
      Boolean(a.compareDocumentPosition(b) & Node.DOCUMENT_POSITION_FOLLOWING);
    expect(follows(next, split)).toBe(true);
    expect(follows(split, upload)).toBe(true);
  });
});

describe("AutoSplitDialog", () => {
  it("opens at 80/10/10 with a total and shows the previewed counts after the debounce", async () => {
    const { previews } = stubFetch();
    const { user } = await renderPage();

    await openDialog(user);

    expect(screen.getByLabelText("Train, %")).toHaveValue("80%");
    expect(screen.getByLabelText("Valid, %")).toHaveValue("10%");
    expect(screen.getByLabelText("Test, %")).toHaveValue("10%");
    expect(screen.getByText("Total: 100%")).toBeInTheDocument();
    expect(
      screen.getByText(
        "Only images without a split are assigned. Images you already assigned stay where they are.",
      ),
    ).toBeInTheDocument();
    await screen.findByText("Images without a split: 7");
    expect(screen.getByText("Result — Train: 5 · Valid: 1 · Test: 1")).toBeInTheDocument();
    expect(previews).toEqual([{ train: 80, valid: 10, test: 10 }]);
    expect(button("Apply split")).toBeEnabled();
  });

  it("writes nothing before Apply is pressed", async () => {
    const { applies } = stubFetch();
    const { user } = await renderPage();

    await openDialog(user);
    await screen.findByText("Images without a split: 7");

    expect(applies).toHaveLength(0);
  });

  it("shows two skeleton lines and a disabled Apply while the preview loads", async () => {
    let release: (response: Response) => void = () => undefined;
    stubFetch({
      onPreview: () =>
        new Promise<Response>((resolve) => {
          release = resolve;
        }),
    });
    const { user } = await renderPage();

    await openDialog(user);

    await waitFor(() => expect(screen.getAllByTestId("auto-split-skeleton")).toHaveLength(2));
    expect(button("Apply split")).toBeDisabled();
    release(jsonResponse(DEFAULT_PREVIEW));
    await screen.findByText("Images without a split: 7");
    expect(screen.queryAllByTestId("auto-split-skeleton")).toHaveLength(0);
    expect(button("Apply split")).toBeEnabled();
  });

  it("explains a total other than 100, disables Apply and requests no preview", async () => {
    const { previews } = stubFetch();
    const { user } = await renderPage();
    await openDialog(user);
    await screen.findByText("Images without a split: 7");

    await setRatio(user, "Test, %", "20");

    await screen.findByText("Total: 110%");
    expect(screen.getByText("Ratios must add up to 100.")).toBeInTheDocument();
    expect(screen.getByText("Total: 110%")).toHaveStyle({ fontWeight: "600" });
    expect(button("Apply split")).toBeDisabled();
    await new Promise((resolve) => setTimeout(resolve, 500));
    expect(previews.some((body) => body.test === 20)).toBe(false);
    expect(previews).toHaveLength(1);
  });

  it("requires Train and Valid above zero", async () => {
    stubFetch();
    const { user } = await renderPage();
    await openDialog(user);
    await screen.findByText("Images without a split: 7");

    await setRatio(user, "Valid, %", "0");
    await setRatio(user, "Test, %", "20");

    await screen.findByText("Train and Valid must be above 0.");
    expect(screen.getByText("Total: 100%")).toBeInTheDocument();
    expect(button("Apply split")).toBeDisabled();
  });

  it("accepts Test at 0 and previews that split", async () => {
    const { previews } = stubFetch({
      onPreview: (_call, body) =>
        jsonResponse({
          seed: 5,
          unassigned_total: 7,
          counts: body.test === 0 ? { train: 6, valid: 1, test: 0 } : { train: 5, valid: 1, test: 1 },
        }),
    });
    const { user } = await renderPage();
    await openDialog(user);
    await screen.findByText("Images without a split: 7");

    await setRatio(user, "Train, %", "90");
    await setRatio(user, "Test, %", "0");

    await screen.findByText("Result — Train: 6 · Valid: 1 · Test: 0");
    expect(previews[previews.length - 1]).toEqual({ train: 90, valid: 10, test: 0 });
    expect(screen.queryByText("Ratios must add up to 100.")).toBeNull();
    expect(button("Apply split")).toBeEnabled();
  });

  it("uses the same wording for a single unassigned image", async () => {
    stubFetch({
      none: 1,
      onPreview: () =>
        jsonResponse({ seed: 9, unassigned_total: 1, counts: { train: 1, valid: 0, test: 0 } }),
    });
    const { user } = await renderPage();

    await openDialog(user);

    await screen.findByText("Images without a split: 1");
    expect(screen.getByText("Result — Train: 1 · Valid: 0 · Test: 0")).toBeInTheDocument();
  });

  it("applies the previewed seed and count, closes, notifies and refreshes the page data", async () => {
    const { fetchMock, applies } = stubFetch();
    const { user } = await renderPage();
    await openDialog(user);
    await screen.findByText("Images without a split: 7");
    const listBefore = callsTo(fetchMock, "/projects/1/images").length;
    const countsBefore = callsTo(fetchMock, "/images/status-counts").length;

    await user.click(button("Apply split"));

    await waitFor(() => expect(applies).toHaveLength(1));
    expect(applies[0]).toEqual({
      train: 80,
      valid: 10,
      test: 10,
      seed: 123,
      expected_unassigned: 7,
    });
    await waitFor(() => expect(screen.queryByText("Split dataset automatically")).toBeNull());
    expect(notifications.show).toHaveBeenCalledWith({
      color: "green",
      message: "Split applied. Train: 5 · Valid: 1 · Test: 1.",
    });
    await waitFor(() =>
      expect(callsTo(fetchMock, "/projects/1/images").length).toBeGreaterThan(listBefore),
    );
    await waitFor(() =>
      expect(callsTo(fetchMock, "/images/status-counts").length).toBeGreaterThan(countsBefore),
    );
  });

  it("shows a loader on Apply while the request runs", async () => {
    let release: (response: Response) => void = () => undefined;
    stubFetch({
      onApply: () =>
        new Promise<Response>((resolve) => {
          release = resolve;
        }),
    });
    const { user } = await renderPage();
    await openDialog(user);
    await screen.findByText("Images without a split: 7");

    await user.click(button("Apply split"));

    await waitFor(() => expect(button("Apply split")).toHaveAttribute("data-loading", "true"));
    release(jsonResponse({ counts: DEFAULT_PREVIEW.counts }));
    await waitFor(() => expect(screen.queryByText("Split dataset automatically")).toBeNull());
  });

  it("keeps the dialog open on a 409, shows the message and fetches a new preview", async () => {
    const { previews } = stubFetch({
      onApply: () => jsonResponse({ detail: DRIFT }, 409),
    });
    const { user } = await renderPage();
    await openDialog(user);
    await screen.findByText("Images without a split: 7");
    expect(previews).toHaveLength(1);

    await user.click(button("Apply split"));

    const dialog = (await screen.findByText(DRIFT)).closest<HTMLElement>('[role="dialog"]');
    expect(dialog).not.toBeNull();
    expect(within(dialog as HTMLElement).getByText("Split dataset automatically")).toBeVisible();
    await waitFor(() => expect(previews.length).toBeGreaterThan(1));
    expect(notifications.show).not.toHaveBeenCalled();
  });

  it("shows any other API error the same way without closing", async () => {
    stubFetch({ onApply: () => jsonResponse({ detail: "Database is busy." }, 500) });
    const { user } = await renderPage();
    await openDialog(user);
    await screen.findByText("Images without a split: 7");

    await user.click(button("Apply split"));

    await screen.findByText("Database is busy.");
    expect(screen.getByText("Split dataset automatically")).toBeInTheDocument();
  });

  it("shows a failed preview as an error and keeps Apply disabled", async () => {
    stubFetch({ onPreview: () => jsonResponse({ detail: "Preview is unavailable." }, 500) });
    const { user } = await renderPage();

    await openDialog(user);

    await screen.findByText("Preview is unavailable.");
    expect(button("Apply split")).toBeDisabled();
  });

  it("starts from 80/10/10 each time it opens", async () => {
    stubFetch();
    const { user } = await renderPage();
    await openDialog(user);
    await setRatio(user, "Test, %", "20");
    await screen.findByText("Total: 110%");

    await user.click(button("Cancel"));
    await waitFor(() => expect(screen.queryByText("Split dataset automatically")).toBeNull());
    await user.click(button("Split dataset"));
    await screen.findByText("Split dataset automatically");

    expect(screen.getByLabelText("Test, %")).toHaveValue("10%");
    expect(screen.getByText("Total: 100%")).toBeInTheDocument();
  });

  it("reads in Russian", async () => {
    stubFetch();
    const { user } = await renderPage("ru");
    await screen.findByText("img-1.jpg");
    await screen.findByText("Разбить набор данных");
    await waitFor(() =>
      expect(button("Разбить набор данных")).not.toHaveAttribute("data-disabled"),
    );

    await user.click(button("Разбить набор данных"));

    await screen.findByText("Автоматическое разбиение набора");
    expect(button("Применить разбиение")).toBeInTheDocument();
    await screen.findByText("Изображений без выборки: 7");
  });
});
