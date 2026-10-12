import { act, screen, waitFor, within } from "@testing-library/react";
import { useLocation } from "react-router-dom";
import { afterEach, describe, expect, it, vi } from "vitest";

import { AppRoutes } from "../../app/routes";
import { renderWithProviders } from "../../test/render";
import { makeRun, stubTrainingApi } from "../../test/trainingApi";

const COMPLETED = makeRun({
  id: 3,
  name: "run-3",
  status: "completed",
  queue_position: null,
  epoch: 10,
  epochs: 10,
  map50: 0.81,
  map50_95: 0.52,
  active_seconds: 125,
  image_count: 160,
  settings: { epochs: 10, imgsz: 640, batch: -1, device: "auto" },
  resolved: { device: "cpu", batch: 16, workers: 0 },
  started_at: "2026-01-15T10:05:00Z",
  finished_at: "2026-01-15T11:05:00Z",
  model: {
    id: 9,
    file_name: "plates_run-3_best.pt",
    size_bytes: 6242090,
    ultralytics_version: "8.4.159",
  },
});
const RUNNING = makeRun({
  id: 2,
  name: "run-2",
  status: "running",
  queue_position: null,
  epoch: 12,
  epochs: 100,
  last_map50: 0.4567,
  started_at: "2026-01-15T10:05:00Z",
});
const QUEUED = makeRun({ id: 1, name: "run-1", status: "queued", queue_position: 2 });

const TRAINING = "/projects/1/training";

afterEach(() => {
  vi.useRealTimers();
});

/** The status Select's own input (its label is also the listbox's accessible name). */
function filterInput(label: string): HTMLElement {
  const input = screen.getAllByLabelText(label).find((element) => element.tagName === "INPUT");
  if (input === undefined) {
    throw new Error(`No select input labelled ${label}`);
  }
  return input;
}

function LocationProbe() {
  const location = useLocation();
  return <output data-testid="location">{`${location.pathname}${location.search}`}</output>;
}

function renderPage(route: string = TRAINING, language = "en") {
  return renderWithProviders(
    <>
      <AppRoutes />
      <LocationProbe />
    </>,
    { route, language },
  );
}

function listedNames(): (string | null)[] {
  return screen.getAllByTestId("run-name").map((name) => name.textContent);
}

// Four runs whose every column orders them differently (ids rise with the created time).
const HISTORY = [
  makeRun({
    id: 4,
    name: "delta",
    status: "completed",
    queue_position: null,
    created_at: "2026-01-15T13:00:00Z",
    started_at: "2026-01-15T13:01:00Z",
    finished_at: "2026-01-15T14:00:00Z",
    active_seconds: 600,
    epoch: 10,
    epochs: 10,
    map50: 0.8,
    map50_95: 0.52,
    image_count: 40,
    base_name: "yolo26s",
    model: { id: 9, file_name: "plates_delta_best.pt", size_bytes: 1, ultralytics_version: null },
  }),
  makeRun({
    id: 3,
    name: "charlie",
    status: "failed",
    queue_position: null,
    created_at: "2026-01-15T12:00:00Z",
    started_at: "2026-01-15T12:01:00Z",
    finished_at: "2026-01-15T12:05:00Z",
    active_seconds: 60,
    epoch: 2,
    epochs: 10,
    last_map50: 0.2,
    image_count: 10,
    base_name: "yolo26n",
  }),
  makeRun({
    id: 2,
    name: "bravo",
    status: "cancelled",
    queue_position: null,
    created_at: "2026-01-15T11:00:00Z",
    started_at: "2026-01-15T11:01:00Z",
    finished_at: "2026-01-15T11:30:00Z",
    active_seconds: 1200,
    epoch: 5,
    epochs: 10,
    last_map50: 0.5,
    map50_95: 0.3,
    last_map50_95: 0.3,
    image_count: 30,
    base_name: "yolo26m",
  }),
  makeRun({ id: 1, name: "alpha", status: "queued", queue_position: 1, created_at: "2026-01-15T10:00:00Z" }),
];

describe("TrainingPage", () => {
  it("lists Training between Classes and Settings in the sidebar and marks it active", async () => {
    stubTrainingApi({ runs: [] });
    renderWithProviders(<AppRoutes />, { route: TRAINING });

    const training = await screen.findByRole("link", { name: "Training" });
    const labels = screen
      .getAllByRole("link")
      .map((link) => link.textContent)
      .filter((text) => ["Overview", "Images", "Classes", "Training", "Settings"].includes(text ?? ""));
    expect(labels).toEqual(["Overview", "Images", "Classes", "Training", "Settings"]);
    expect(training).toHaveAttribute("data-active", "true");
  });

  it("shows the empty state with exactly one New training button when there are no runs", async () => {
    stubTrainingApi({ runs: [] });
    renderWithProviders(<AppRoutes />, { route: TRAINING });

    expect(await screen.findByText("No training runs yet")).toBeInTheDocument();
    expect(screen.getByText(/First assign images to the Train and Valid splits/)).toBeInTheDocument();
    expect(screen.getAllByRole("link", { name: "New training" })).toHaveLength(1);
  });

  it("lists runs newest first with status, base model, mAP50 and a download link on completed runs", async () => {
    stubTrainingApi({ runs: [COMPLETED, RUNNING, QUEUED] });
    renderWithProviders(<AppRoutes />, { route: TRAINING });

    expect(await screen.findByText("Runs: 3")).toBeInTheDocument();
    const names = screen.getAllByTestId("run-row").map((row) => within(row).getByTestId("run-name").textContent);
    expect(names).toEqual(["run-3", "run-2", "run-1"]);

    const [completedRow, runningRow, queuedRow] = screen.getAllByTestId("run-row");
    expect(within(completedRow).getByText("0.810")).toBeInTheDocument();
    expect(within(completedRow).getByText("Completed")).toBeInTheDocument();
    expect(within(completedRow).getByText("yolo26n")).toBeInTheDocument();
    const download = within(completedRow).getByRole("link", { name: /plates_run-3_best\.pt/ });
    expect(download).toHaveAttribute("href", "/api/models/9/download");
    expect(download).toHaveAttribute("download");

    expect(within(runningRow).getByText("Epoch 12 of 100")).toBeInTheDocument();
    expect(within(runningRow).getByText("0.457")).toBeInTheDocument();
    expect(within(runningRow).queryByRole("link", { name: /Download/ })).toBeNull();

    expect(within(queuedRow).getByText("In queue: 2")).toBeInTheDocument();
    expect(within(queuedRow).queryByRole("link", { name: /Download/ })).toBeNull();
  });

  it("shows the title row with the New training link to the form", async () => {
    stubTrainingApi({ runs: [COMPLETED, RUNNING, QUEUED] });
    renderWithProviders(<AppRoutes />, { route: TRAINING });

    expect(await screen.findByText("Runs: 3")).toBeInTheDocument();
    const create = screen.getByRole("link", { name: "New training" });
    expect(create).toHaveAttribute("href", "/projects/1/training/new");
  });

  it("renders one run like many", async () => {
    stubTrainingApi({ runs: [QUEUED] });
    renderWithProviders(<AppRoutes />, { route: TRAINING });

    expect(await screen.findByText("Runs: 1")).toBeInTheDocument();
    expect(screen.getAllByTestId("run-row")).toHaveLength(1);
  });

  it("shows a completed run's duration, epochs, key settings, final metrics and snapshot size", async () => {
    stubTrainingApi({ runs: [COMPLETED] });
    renderWithProviders(<AppRoutes />, { route: TRAINING });

    const row = await screen.findByTestId("run-row");
    expect(within(row).getByText("640 · 16 · CPU")).toBeInTheDocument();
    expect(within(row).getByText("0:02:05")).toBeInTheDocument();
    expect(within(row).getByText("10/10")).toBeInTheDocument();
    expect(within(row).getByText("0.810")).toBeInTheDocument();
    expect(within(row).getByText("0.520")).toBeInTheDocument();
    expect(within(row).getByText("160")).toBeInTheDocument();
    expect(within(row).getByRole("link", { name: /plates_run-3_best\.pt/ })).toBeInTheDocument();
    // a final value is not a last-epoch value: no explanatory title
    expect(within(row).getByText("0.810")).not.toHaveAttribute("title");
    expect(within(row).getByText("640 · 16 · CPU")).toHaveAttribute(
      "title",
      "Image size 640 · Batch size 16 · Device CPU",
    );
  });

  it("shows a dash for the duration, epochs, mAP and images of a queued run that never started", async () => {
    stubTrainingApi({ runs: [QUEUED] });
    renderWithProviders(<AppRoutes />, { route: TRAINING });

    const row = await screen.findByTestId("run-row");
    const cells = within(row).getAllByRole("cell");
    // name, status, base, created, duration, epochs, settings, mAP50, mAP50-95, images, download
    expect(cells).toHaveLength(11);
    for (const index of [4, 5, 7, 8, 9]) {
      expect(cells[index]).toHaveTextContent("—");
    }
    // an auto request that was not resolved yet stays "Auto"
    expect(cells[6]).toHaveTextContent("640 · Auto · Auto");
  });

  it("explains that a cancelled run's mAP is the value of its last completed epoch", async () => {
    const cancelled = makeRun({
      id: 5,
      name: "run-5",
      status: "cancelled",
      queue_position: null,
      epoch: 1,
      epochs: 2,
      last_map50: 0.5,
      map50: null,
      map50_95: 0.3,
      last_map50_95: 0.3,
      started_at: "2026-01-15T10:05:00Z",
      active_seconds: 30,
    });
    stubTrainingApi({ runs: [cancelled] });
    renderWithProviders(<AppRoutes />, { route: TRAINING });

    const row = await screen.findByTestId("run-row");
    expect(within(row).getByText("0.500")).toHaveAttribute("title", "Value from the last completed epoch");
    expect(within(row).getByText("0.300")).toHaveAttribute("title", "Value from the last completed epoch");
    expect(within(row).getByText("1/2")).toBeInTheDocument();
  });

  it("scrolls horizontally and keeps the name cell sticky", async () => {
    stubTrainingApi({ runs: [COMPLETED] });
    renderWithProviders(<AppRoutes />, { route: TRAINING });

    const table = await screen.findByRole("table");
    // CSS modules are not applied in jsdom: the markup carries the scroll container, the
    // min-width wrapper and the sticky name cell through their class names.
    expect(table.parentElement).toHaveClass(/scroller/);
    expect(table).toHaveClass(/table/);
    const row = screen.getByTestId("run-row");
    expect(within(row).getAllByRole("cell")[0]).toHaveClass(/nameCell/);
  });

  it("opens the run page from the row name and keeps the download anchor outside that link", async () => {
    stubTrainingApi({ runs: [COMPLETED] });
    renderWithProviders(<AppRoutes />, { route: TRAINING });

    const nameLink = await screen.findByRole("link", { name: "run-3" });
    expect(nameLink).toHaveAttribute("href", "/projects/1/training/3");
    const download = screen.getByRole("link", { name: /plates_run-3_best\.pt/ });
    expect(nameLink.contains(download)).toBe(false);
    expect(download.closest('a[href="/projects/1/training/3"]')).toBeNull();
  });

  it("truncates long names and base models to one line with the full text in a title", async () => {
    const longName = "n".repeat(100);
    stubTrainingApi({ runs: [makeRun({ id: 4, name: longName, base_name: "b".repeat(100) })] });
    renderWithProviders(<AppRoutes />, { route: TRAINING });

    expect(await screen.findByTestId("run-name")).toHaveTextContent(longName);
    expect(screen.getByRole("link", { name: longName })).toHaveAttribute("title", longName);
    expect(screen.getByTitle("b".repeat(100))).toBeInTheDocument();
  });

  it("shows three skeleton rows while the list loads", async () => {
    const stub = stubTrainingApi({ runs: [] });
    let release: (() => void) | undefined;
    const original = globalThis.fetch;
    vi.stubGlobal(
      "fetch",
      vi.fn(async (input: string | URL | Request, init?: RequestInit) => {
        const url = typeof input === "string" ? input : input.toString();
        if (url.endsWith("/api/projects/1/runs")) {
          await new Promise<void>((resolve) => {
            release = resolve;
          });
        }
        return original(input, init);
      }),
    );
    renderWithProviders(<AppRoutes />, { route: TRAINING });

    const loading = await screen.findByTestId("runs-loading");
    expect(loading.children).toHaveLength(3);
    release?.();
    expect(await screen.findByText("No training runs yet")).toBeInTheDocument();
    expect(stub.count("GET /api/projects/1/runs")).toBe(1);
  });

  it("shows the API message and refetches on Try again after a list failure", async () => {
    let failing = true;
    const stub = stubTrainingApi({ runs: () => [QUEUED] });
    const original = globalThis.fetch;
    vi.stubGlobal(
      "fetch",
      vi.fn(async (input: string | URL | Request, init?: RequestInit) => {
        const url = typeof input === "string" ? input : input.toString();
        if (failing && url.endsWith("/api/projects/1/runs")) {
          return new Response(JSON.stringify({ detail: "Database is unavailable." }), {
            status: 500,
            headers: { "Content-Type": "application/json" },
          });
        }
        return original(input, init);
      }),
    );
    const { user } = renderWithProviders(<AppRoutes />, { route: TRAINING });

    expect(await screen.findByText("Database is unavailable.")).toBeInTheDocument();
    failing = false;
    await user.click(screen.getByRole("button", { name: "Try again" }));
    expect(await screen.findByTestId("run-name")).toHaveTextContent("run-1");
    expect(stub.count("GET /api/projects/1/runs")).toBe(1);
  });

  it("polls every 3 seconds while a run is running", async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    const stub = stubTrainingApi({ runs: [RUNNING] });
    renderWithProviders(<AppRoutes />, { route: TRAINING });

    expect(await screen.findByText("Epoch 12 of 100")).toBeInTheDocument();
    expect(stub.count("GET /api/projects/1/runs")).toBe(1);
    await act(async () => {
      await vi.advanceTimersByTimeAsync(3100);
    });
    await waitFor(() => expect(stub.count("GET /api/projects/1/runs")).toBe(2));
  });

  it("does not poll when every run is finished", async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    const stub = stubTrainingApi({ runs: [COMPLETED] });
    renderWithProviders(<AppRoutes />, { route: TRAINING });

    expect(await screen.findByText("0.810")).toBeInTheDocument();
    await act(async () => {
      await vi.advanceTimersByTimeAsync(7000);
    });
    expect(stub.count("GET /api/projects/1/runs")).toBe(1);
  });

  it("renders the Russian history headers and sort labels", async () => {
    stubTrainingApi({ runs: [QUEUED] });
    renderWithProviders(<AppRoutes />, { route: TRAINING, language: "ru" });

    expect(await screen.findByText("Длительность")).toBeInTheDocument();
    expect(screen.getByText("Изображений")).toBeInTheDocument();
    expect(screen.getByText("Базовая модель")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Сортировать по: Длительность" })).toBeInTheDocument();
    expect(filterInput("Фильтр по статусу")).toBeInTheDocument();
  });

  it("renders the column headers and badges in Russian", async () => {
    stubTrainingApi({ runs: [QUEUED] });
    renderWithProviders(<AppRoutes />, { route: TRAINING, language: "ru" });

    expect(await screen.findByText("Статус")).toBeInTheDocument();
    expect(screen.getByText("В очереди: 2")).toBeInTheDocument();
    expect(screen.getByText("Запусков: 1")).toBeInTheDocument();
  });
});

describe("TrainingPage sorting", () => {
  it("marks Created descending by default and lists runs newest first", async () => {
    stubTrainingApi({ runs: HISTORY });
    renderPage();

    await screen.findByText("Runs: 4");
    expect(listedNames()).toEqual(["delta", "charlie", "bravo", "alpha"]);
    const headers = screen.getAllByRole("columnheader");
    expect(headers).toHaveLength(11);
    const sorted = headers.map((header) => header.getAttribute("aria-sort"));
    // name, status, base, created, duration, epochs, settings, mAP50, mAP50-95, images, download
    expect(sorted).toEqual([
      "none",
      "none",
      "none",
      "descending",
      "none",
      "none",
      null,
      "none",
      "none",
      "none",
      null,
    ]);
    expect(screen.getByTestId("location")).toHaveTextContent(/^\/projects\/1\/training$/);
  });

  it("makes nine headers sort buttons and leaves Settings and Download alone", async () => {
    stubTrainingApi({ runs: HISTORY });
    renderPage();

    await screen.findByText("Runs: 4");
    const headers = screen.getAllByRole("columnheader");
    expect(within(headers[6]).queryByRole("button")).toBeNull();
    expect(within(headers[10]).queryByRole("button")).toBeNull();
    for (const index of [0, 1, 2, 3, 4, 5, 7, 8, 9]) {
      expect(within(headers[index]).getByRole("button")).toHaveAccessibleName(/^Sort by: /);
    }
    expect(screen.getByRole("button", { name: "Sort by: mAP50-95" })).toBeInTheDocument();
  });

  it("sorts a text column ascending first, flips on the second click and writes the URL with replace", async () => {
    stubTrainingApi({ runs: HISTORY });
    const { user } = renderPage();
    await screen.findByText("Runs: 4");

    await user.click(screen.getByRole("button", { name: "Sort by: Name" }));
    expect(listedNames()).toEqual(["alpha", "bravo", "charlie", "delta"]);
    expect(screen.getByTestId("location")).toHaveTextContent("?sort=name&dir=asc");
    expect(screen.getAllByRole("columnheader")[0]).toHaveAttribute("aria-sort", "ascending");
    expect(screen.getAllByRole("columnheader")[3]).toHaveAttribute("aria-sort", "none");

    await user.click(screen.getByRole("button", { name: "Sort by: Name" }));
    expect(listedNames()).toEqual(["delta", "charlie", "bravo", "alpha"]);
    expect(screen.getByTestId("location")).toHaveTextContent(/\?sort=name$/);
    expect(screen.getAllByRole("columnheader")[0]).toHaveAttribute("aria-sort", "descending");
  });

  it("sorts a numeric column descending first with missing values last", async () => {
    stubTrainingApi({ runs: HISTORY });
    const { user } = renderPage();
    await screen.findByText("Runs: 4");

    await user.click(screen.getByRole("button", { name: "Sort by: mAP50-95" }));
    // delta 0.52, bravo 0.3 (last epoch), then the two runs without a value, newest id first
    expect(listedNames()).toEqual(["delta", "bravo", "charlie", "alpha"]);
    expect(screen.getByTestId("location")).toHaveTextContent(/\?sort=map5095$/);

    await user.click(screen.getByRole("button", { name: "Sort by: mAP50-95" }));
    expect(listedNames()).toEqual(["bravo", "delta", "charlie", "alpha"]);
    expect(screen.getByTestId("location")).toHaveTextContent("?sort=map5095&dir=asc");
  });

  it("sorts by status in the fixed order and by duration from active time", async () => {
    stubTrainingApi({ runs: HISTORY });
    const { user } = renderPage();
    await screen.findByText("Runs: 4");

    await user.click(screen.getByRole("button", { name: "Sort by: Status" }));
    expect(listedNames()).toEqual(["alpha", "charlie", "bravo", "delta"]);

    await user.click(screen.getByRole("button", { name: "Sort by: Duration" }));
    expect(listedNames()).toEqual(["bravo", "delta", "charlie", "alpha"]);
  });

  it("shows the active column in 600 with an aria-hidden arrow", async () => {
    stubTrainingApi({ runs: HISTORY });
    renderPage();

    await screen.findByText("Runs: 4");
    const created = screen.getByRole("button", { name: "Sort by: Created" });
    const arrow = within(created).getByText("↓");
    expect(arrow).toHaveAttribute("aria-hidden", "true");
    expect(created).toHaveAttribute("data-active", "true");
    expect(within(screen.getByRole("button", { name: "Sort by: Name" })).queryByText(/[↑↓]/)).toBeNull();
  });

  it("restores sort, direction and status from the URL", async () => {
    stubTrainingApi({ runs: HISTORY });
    renderPage(`${TRAINING}?sort=map5095&dir=asc&status=failed`);

    expect(await screen.findByText("Shown: 1 of 4")).toBeInTheDocument();
    expect(listedNames()).toEqual(["charlie"]);
    expect(screen.getAllByRole("columnheader")[8]).toHaveAttribute("aria-sort", "ascending");
    expect(filterInput("Filter by status")).toHaveValue("Failed");
  });

  it("falls back to Created descending and all statuses for unknown URL values", async () => {
    stubTrainingApi({ runs: HISTORY });
    renderPage(`${TRAINING}?sort=bogus&dir=up&status=nope`);

    expect(await screen.findByText("Runs: 4")).toBeInTheDocument();
    expect(listedNames()).toEqual(["delta", "charlie", "bravo", "alpha"]);
    expect(screen.getAllByRole("columnheader")[3]).toHaveAttribute("aria-sort", "descending");
  });
});

describe("TrainingPage status filter", () => {
  it("offers all statuses and the seven statuses", async () => {
    stubTrainingApi({ runs: HISTORY });
    const { user } = renderPage();
    await screen.findByText("Runs: 4");

    await user.click(filterInput("Filter by status"));

    const names = (await screen.findAllByRole("option", { hidden: true })).map((option) => option.textContent);
    expect(names).toEqual([
      "All statuses",
      "Preparing",
      "In queue",
      "Running",
      "Completed",
      "Failed",
      "Interrupted",
      "Cancelled",
    ]);
  });

  it("shows only the matching runs with a filtered count and keeps the choice in the URL", async () => {
    stubTrainingApi({ runs: HISTORY });
    const { user } = renderPage();
    await screen.findByText("Runs: 4");

    await user.click(filterInput("Filter by status"));
    await user.click(await screen.findByRole("option", { name: "Failed", hidden: true }));

    expect(await screen.findByText("Shown: 1 of 4")).toBeInTheDocument();
    expect(listedNames()).toEqual(["charlie"]);
    expect(screen.getByTestId("location")).toHaveTextContent(/\?status=failed$/);
  });

  it("explains a filter that matches nothing and resets it with Show all runs", async () => {
    stubTrainingApi({ runs: HISTORY });
    const { user } = renderPage(`${TRAINING}?sort=name&dir=asc`);
    await screen.findByText("Runs: 4");

    await user.click(filterInput("Filter by status"));
    await user.click(await screen.findByRole("option", { name: "Running", hidden: true }));

    expect(await screen.findByText("No matching runs")).toBeInTheDocument();
    expect(screen.getByText("No runs have this status.")).toBeInTheDocument();
    expect(screen.queryAllByTestId("run-row")).toHaveLength(0);
    // the title row and the header row stay
    expect(screen.getAllByRole("columnheader")).toHaveLength(11);
    expect(screen.getByRole("link", { name: "New training" })).toBeInTheDocument();
    expect(screen.getByText("Shown: 0 of 4")).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Show all runs" }));

    expect(listedNames()).toEqual(["alpha", "bravo", "charlie", "delta"]);
    expect(screen.getByTestId("location")).toHaveTextContent(/\?sort=name&dir=asc$/);
    expect(screen.queryByText("No matching runs")).toBeNull();
  });

  it("hides the filter and the title-row CTA while there are no runs", async () => {
    stubTrainingApi({ runs: [] });
    renderPage();

    expect(await screen.findByText("No training runs yet")).toBeInTheDocument();
    expect(screen.queryAllByLabelText("Filter by status")).toHaveLength(0);
    expect(screen.getAllByRole("link", { name: "New training" })).toHaveLength(1);
  });

  it("keeps polling every 3 seconds while a listed run is active, filter or not", async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    const stub = stubTrainingApi({ runs: HISTORY });
    renderPage(`${TRAINING}?status=failed`);

    expect(await screen.findByText("Shown: 1 of 4")).toBeInTheDocument();
    await act(async () => {
      await vi.advanceTimersByTimeAsync(3100);
    });
    await waitFor(() => expect(stub.count("GET /api/projects/1/runs")).toBe(2));
  });
});
