import { act, screen, waitFor, within } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("@mantine/notifications", () => ({
  notifications: { show: vi.fn() },
}));

import { notifications } from "@mantine/notifications";

import { AppRoutes } from "../../app/routes";
import { renderWithProviders } from "../../test/render";
import { makeRun, stubTrainingApi } from "../../test/trainingApi";

const RUN_PATH = "/projects/1/training/7";
const STARTED_AT = "2026-01-15T10:05:00Z";

const MODEL = {
  id: 9,
  file_name: "plates_run-3_best.pt",
  size_bytes: 6242090,
  ultralytics_version: "8.4.159",
};

function running(overrides: Record<string, unknown> = {}) {
  return makeRun({
    id: 7,
    name: "run-7",
    status: "running",
    queue_position: null,
    epoch: 12,
    epochs: 100,
    last_map50: 0.4567,
    started_at: STARTED_AT,
    ...overrides,
  });
}

function completed(overrides: Record<string, unknown> = {}) {
  return makeRun({
    id: 7,
    name: "run-7",
    status: "completed",
    queue_position: null,
    epoch: 100,
    epochs: 100,
    started_at: STARTED_AT,
    finished_at: "2026-01-15T11:05:30Z",
    map50: 0.812,
    metrics: { precision: 0.9, recall: 0.8, map50: 0.812, map50_95: 0.5 },
    model: MODEL,
    ...overrides,
  });
}

function seconds(clock: string): number {
  const [h, m, s] = clock.split(":").map(Number);
  return h * 3600 + m * 60 + s;
}

afterEach(() => {
  vi.useRealTimers();
  vi.mocked(notifications.show).mockClear();
});

describe("RunPage progress", () => {
  it("shows the epoch, a progress bar, a ticking elapsed time and the latest mAP50 for a running run", async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true, now: new Date("2026-01-15T10:06:05Z") });
    stubTrainingApi({ run: running() });
    renderWithProviders(<AppRoutes />, { route: RUN_PATH });

    expect((await screen.findAllByText("Epoch 12 of 100")).length).toBeGreaterThan(0);
    const bar = screen.getByRole("progressbar");
    expect(bar).toHaveAttribute("aria-valuenow", "12");
    expect(bar).toHaveAttribute("aria-valuemax", "100");
    expect(bar).toHaveAttribute("aria-live", "off");
    expect(screen.getByText("Latest mAP50: 0.457")).toBeInTheDocument();
    expect(screen.getByText(/You can close this page\. Training continues/)).toBeInTheDocument();

    const before = /Elapsed: (\d+:\d{2}:\d{2})/.exec(screen.getByText(/Elapsed:/).textContent ?? "");
    expect(before).not.toBeNull();
    expect(seconds(before![1])).toBeGreaterThanOrEqual(65);
    await act(async () => {
      await vi.advanceTimersByTimeAsync(1000);
    });
    const after = /Elapsed: (\d+:\d{2}:\d{2})/.exec(screen.getByText(/Elapsed:/).textContent ?? "");
    expect(seconds(after![1])).toBeGreaterThan(seconds(before![1]));
  });

  it("shows Starting with no bar before the first epoch", async () => {
    stubTrainingApi({ run: running({ epoch: null, last_map50: null }) });
    renderWithProviders(<AppRoutes />, { route: RUN_PATH });

    expect(await screen.findByText("Starting…")).toBeInTheDocument();
    expect(
      screen.getByText("The first use of an official model downloads its weights."),
    ).toBeInTheDocument();
    expect(screen.queryByRole("progressbar")).toBeNull();
  });

  it("caps the epoch at epochs and explains the final validation", async () => {
    stubTrainingApi({ run: running({ epoch: 100 }) });
    renderWithProviders(<AppRoutes />, { route: RUN_PATH });

    expect((await screen.findAllByText("Epoch 100 of 100")).length).toBeGreaterThan(0);
    expect(
      screen.getByText("Finishing: validating the best model and registering it."),
    ).toBeInTheDocument();
  });

  it("never shows an epoch above epochs", async () => {
    stubTrainingApi({ run: running({ epoch: 101 }) });
    renderWithProviders(<AppRoutes />, { route: RUN_PATH });

    expect((await screen.findAllByText("Epoch 100 of 100")).length).toBeGreaterThan(0);
    expect(screen.queryByText("Epoch 101 of 100")).toBeNull();
  });

  it("shows the preparing text", async () => {
    stubTrainingApi({ run: makeRun({ id: 7, name: "run-7", status: "preparing", queue_position: null }) });
    renderWithProviders(<AppRoutes />, { route: RUN_PATH });

    expect(await screen.findByText("Preparing the dataset…")).toBeInTheDocument();
  });

  it("shows the queue position and that the page can be closed for a queued run", async () => {
    stubTrainingApi({ run: makeRun({ id: 7, name: "run-7", status: "queued", queue_position: 3 }) });
    renderWithProviders(<AppRoutes />, { route: RUN_PATH });

    expect(await screen.findByText("In queue: position 3")).toBeInTheDocument();
    expect(screen.getByText(/You can close this page/)).toBeInTheDocument();
  });

  it("renders the epoch headline in Russian", async () => {
    stubTrainingApi({ run: running() });
    renderWithProviders(<AppRoutes />, { route: RUN_PATH, language: "ru" });

    expect((await screen.findAllByText("Эпоха 12 из 100")).length).toBeGreaterThan(0);
  });
});

describe("RunPage result", () => {
  it("shows four metric tiles, the verdict, the model file, the usage hint and the download link", async () => {
    stubTrainingApi({ run: completed() });
    renderWithProviders(<AppRoutes />, { route: RUN_PATH });

    expect(await screen.findByText("Training complete")).toBeInTheDocument();
    for (const value of ["0.900", "0.800", "0.812", "0.500"]) {
      expect(screen.getByText(value)).toBeInTheDocument();
    }
    for (const caption of ["Precision", "Recall", "mAP50", "mAP50-95"]) {
      expect(screen.getByText(caption)).toBeInTheDocument();
    }
    expect(screen.getByText("Good result")).toBeInTheDocument();
    expect(screen.getByText("Verdict is based on mAP50.")).toBeInTheDocument();
    expect(screen.getByText("Model file: plates_run-3_best.pt · 6.2 MB")).toBeInTheDocument();
    expect(screen.getByText('YOLO("plates_run-3_best.pt")')).toBeInTheDocument();
    expect(screen.getByText(/Trained with Ultralytics 8\.4\.159/)).toBeInTheDocument();
    expect(screen.queryByText("Metrics are measured on masks.")).toBeNull();

    const download = screen.getByRole("link", { name: "Download .pt" });
    expect(download).toHaveAttribute("href", "/api/models/9/download");
    expect(download).toHaveAttribute("download");
  });

  it("notes that the metrics of a segment project are measured on masks", async () => {
    stubTrainingApi({ run: completed({ task_type: "segment" }) });
    renderWithProviders(<AppRoutes />, { route: RUN_PATH });

    expect(await screen.findByText("Metrics are measured on masks.")).toBeInTheDocument();
  });

  it("shows a dash in the tile and no quality badge when mAP50 is missing", async () => {
    stubTrainingApi({
      run: completed({
        map50: null,
        metrics: { precision: 0.9, recall: 0.8, map50: null, map50_95: 0.5 },
      }),
    });
    renderWithProviders(<AppRoutes />, { route: RUN_PATH });

    expect(await screen.findByText("Training complete")).toBeInTheDocument();
    expect(screen.getByTestId("metric-map50")).toHaveTextContent("—");
    expect(screen.queryByText("Good result")).toBeNull();
    expect(screen.queryByText("Verdict is based on mAP50.")).toBeNull();
  });
});

describe("RunPage polling and announcements", () => {
  it("polls a running run every 3 seconds", async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    const stub = stubTrainingApi({ run: running() });
    renderWithProviders(<AppRoutes />, { route: RUN_PATH });

    expect((await screen.findAllByText("Epoch 12 of 100")).length).toBeGreaterThan(0);
    expect(stub.count("GET /api/projects/1/runs/7")).toBe(1);
    await act(async () => {
      await vi.advanceTimersByTimeAsync(3100);
    });
    await waitFor(() => expect(stub.count("GET /api/projects/1/runs/7")).toBe(2));
  });

  it("does not poll a completed run", async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    const stub = stubTrainingApi({ run: completed() });
    renderWithProviders(<AppRoutes />, { route: RUN_PATH });

    expect(await screen.findByText("Training complete")).toBeInTheDocument();
    await act(async () => {
      await vi.advanceTimersByTimeAsync(7000);
    });
    expect(stub.count("GET /api/projects/1/runs/7")).toBe(1);
  });

  it("announces a status change politely, never an epoch tick", async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    let current = running();
    stubTrainingApi({ run: () => current });
    renderWithProviders(<AppRoutes />, { route: RUN_PATH });

    expect((await screen.findAllByText("Epoch 12 of 100")).length).toBeGreaterThan(0);
    const region = screen.getByTestId("run-live-region");
    expect(region).toHaveAttribute("role", "status");
    expect(region).toHaveAttribute("aria-live", "polite");
    expect(region.textContent).toBe("");

    current = running({ epoch: 13 });
    await act(async () => {
      await vi.advanceTimersByTimeAsync(3100);
    });
    expect((await screen.findAllByText("Epoch 13 of 100")).length).toBeGreaterThan(0);
    expect(region.textContent).toBe("");

    current = completed();
    await act(async () => {
      await vi.advanceTimersByTimeAsync(3100);
    });
    await waitFor(() => expect(region).toHaveTextContent("Training complete"));
  });

  it("announces a failed run", async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    let current = running();
    stubTrainingApi({ run: () => current });
    renderWithProviders(<AppRoutes />, { route: RUN_PATH });

    expect((await screen.findAllByText("Epoch 12 of 100")).length).toBeGreaterThan(0);
    current = makeRun({ id: 7, name: "run-7", status: "failed", queue_position: null, epoch: 12 });
    await act(async () => {
      await vi.advanceTimersByTimeAsync(3100);
    });
    await waitFor(() =>
      expect(screen.getByTestId("run-live-region")).toHaveTextContent("Training failed"),
    );
  });
});

describe("RunPage states", () => {
  it("shows Run not found with a way back and stops polling on a 404", async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    const stub = stubTrainingApi({});
    renderWithProviders(<AppRoutes />, { route: "/projects/1/training/99" });

    expect(await screen.findByText("Run not found")).toBeInTheDocument();
    const back = screen.getByRole("link", { name: "Back to training" });
    expect(back).toHaveAttribute("href", "/projects/1/training");
    await act(async () => {
      await vi.advanceTimersByTimeAsync(7000);
    });
    expect(stub.count("GET /api/projects/1/runs/99")).toBe(1);
  });

  it("treats a non-numeric run id as not found", async () => {
    stubTrainingApi({});
    renderWithProviders(<AppRoutes />, { route: "/projects/1/training/abc" });

    expect(await screen.findByText("Run not found")).toBeInTheDocument();
  });

  it("shows skeletons while the first load is pending", async () => {
    stubTrainingApi({ run: running() });
    renderWithProviders(<AppRoutes />, { route: RUN_PATH });

    expect(await screen.findByTestId("run-loading")).toBeInTheDocument();
    expect((await screen.findAllByText("Epoch 12 of 100")).length).toBeGreaterThan(0);
  });

  it("truncates a long run name to one line with the full name in a title", async () => {
    const longName = "n".repeat(100);
    stubTrainingApi({ run: running({ name: longName }) });
    renderWithProviders(<AppRoutes />, { route: RUN_PATH });

    const heading = await screen.findByRole("heading", { level: 2, name: longName });
    expect(heading).toHaveAttribute("title", longName);
  });

  it("marks Training as the active sidebar section on a run page", async () => {
    stubTrainingApi({ run: running() });
    renderWithProviders(<AppRoutes />, { route: RUN_PATH });

    const nav = await screen.findByRole("link", { name: "Training" });
    expect(nav).toHaveAttribute("data-active", "true");
    expect(within(nav).getByText("Training")).toBeInTheDocument();
  });
});

function failed(overrides: Record<string, unknown> = {}) {
  return makeRun({
    id: 7,
    name: "run-7",
    status: "failed",
    queue_position: null,
    epoch: 3,
    started_at: STARTED_AT,
    finished_at: "2026-01-15T10:20:00Z",
    error_message: "CUDA out of memory.",
    log_tail: "epoch 1/3\nepoch 2/3\nCUDA out of memory.",
    ...overrides,
  });
}

function queued(overrides: Record<string, unknown> = {}) {
  return makeRun({ id: 7, name: "run-7", status: "queued", queue_position: 2, ...overrides });
}

describe("RunPage failed run", () => {
  it("shows the error message and keeps the log collapsed until Show log is clicked", async () => {
    stubTrainingApi({ run: failed() });
    const view = renderWithProviders(<AppRoutes />, { route: RUN_PATH });

    expect(await screen.findByText("Training failed")).toBeInTheDocument();
    expect(screen.getByText("CUDA out of memory.", { selector: "div,p" })).toBeInTheDocument();
    expect(screen.getByText("Last log lines")).not.toBeVisible();

    await view.user.click(screen.getByRole("button", { name: "Show log" }));

    expect(screen.getByText("Last log lines")).toBeVisible();
    expect(screen.getByText(/epoch 1\/3/)).toBeVisible();
    expect(screen.getByRole("button", { name: "Copy log" })).toBeVisible();
    expect(screen.getByRole("button", { name: "Hide log" })).toBeInTheDocument();
  });

  it("copies the log", async () => {
    stubTrainingApi({ run: failed() });
    const view = renderWithProviders(<AppRoutes />, { route: RUN_PATH });

    await view.user.click(await screen.findByRole("button", { name: "Show log" }));
    await view.user.click(screen.getByRole("button", { name: "Copy log" }));

    expect(await screen.findByRole("button", { name: "Copied" })).toBeInTheDocument();
    expect(await navigator.clipboard.readText()).toBe("epoch 1/3\nepoch 2/3\nCUDA out of memory.");
  });

  it("explains a missing error message and an empty log", async () => {
    stubTrainingApi({ run: failed({ error_message: null, log_tail: null }) });
    const view = renderWithProviders(<AppRoutes />, { route: RUN_PATH });

    expect(
      await screen.findByText(
        "The training process stopped without an error message. Check the log below.",
      ),
    ).toBeInTheDocument();
    await view.user.click(screen.getByRole("button", { name: "Show log" }));
    expect(screen.getByText("The log is empty.")).toBeVisible();
    expect(screen.queryByRole("button", { name: "Copy log" })).toBeNull();
  });

  it("shows an empty-string log as empty too", async () => {
    stubTrainingApi({ run: failed({ log_tail: "" }) });
    const view = renderWithProviders(<AppRoutes />, { route: RUN_PATH });

    await view.user.click(await screen.findByRole("button", { name: "Show log" }));

    expect(screen.getByText("The log is empty.")).toBeVisible();
  });

  it("renders log and message as text only, in a scrolling pre-wrap block", async () => {
    const hostile = '<img src=x onerror="alert(1)">';
    stubTrainingApi({ run: failed({ error_message: hostile, log_tail: `${hostile}\nline 2` }) });
    const view = renderWithProviders(<AppRoutes />, { route: RUN_PATH });

    await view.user.click(await screen.findByRole("button", { name: "Show log" }));

    expect(document.querySelector("img")).toBeNull();
    const block = screen.getByText(/line 2/, { selector: "pre" });
    expect(block).toHaveStyle({ maxHeight: "320px", overflow: "auto", whiteSpace: "pre-wrap" });
    expect(block.textContent).toContain(hostile);
  });
});

describe("RunPage interrupted and cancelled runs", () => {
  it("explains a restart, the last epoch and offers a new run (no resume)", async () => {
    stubTrainingApi({
      run: makeRun({
        id: 7,
        name: "run-7",
        status: "interrupted",
        queue_position: null,
        epoch: 7,
        epochs: 50,
        error_message: "The service was restarted while this run was training.",
      }),
    });
    renderWithProviders(<AppRoutes />, { route: RUN_PATH });

    expect(await screen.findByText("Run interrupted")).toBeInTheDocument();
    expect(
      screen.getByText("The service was restarted while this run was training."),
    ).toBeInTheDocument();
    expect(screen.getByText("Last completed epoch: 7 of 50.")).toBeInTheDocument();
    expect(screen.getByText("Start a new run to train again.")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "New training" })).toHaveAttribute(
      "href",
      "/projects/1/training/new",
    );
    expect(screen.queryByRole("button", { name: /resume/i })).toBeNull();
  });

  it("omits the epoch line when the epoch is unknown", async () => {
    stubTrainingApi({
      run: makeRun({ id: 7, name: "run-7", status: "interrupted", queue_position: null, epoch: null }),
    });
    renderWithProviders(<AppRoutes />, { route: RUN_PATH });

    expect(await screen.findByText("Run interrupted")).toBeInTheDocument();
    expect(screen.queryByText(/Last completed epoch/)).toBeNull();
  });

  it("shows a gray Run cancelled card", async () => {
    stubTrainingApi({
      run: makeRun({ id: 7, name: "run-7", status: "cancelled", queue_position: null }),
    });
    renderWithProviders(<AppRoutes />, { route: RUN_PATH });

    expect(await screen.findByText("Run cancelled")).toBeInTheDocument();
    expect(screen.getByText("This run was cancelled before it finished.")).toBeInTheDocument();
  });
});

function settingsRows(): Map<string, string> {
  const card = screen.getByTestId("run-settings");
  const rows = new Map<string, string>();
  for (const term of card.querySelectorAll("dt")) {
    rows.set(term.textContent ?? "", term.nextElementSibling?.textContent ?? "");
  }
  return rows;
}

describe("RunPage settings card", () => {
  it("shows the frozen settings of a completed CPU run with the resolved values", async () => {
    stubTrainingApi({
      run: completed({
        resolved: { device: "cpu", batch: 16, workers: 0 },
        dataset_counts: { train: 120, valid: 30, test: 10 },
        class_names: ["car", "plate"],
      }),
    });
    renderWithProviders(<AppRoutes />, { route: RUN_PATH });

    expect(await screen.findByText("Settings used")).toBeInTheDocument();
    const rows = settingsRows();
    expect(rows.get("Base model")).toBe("yolo26n");
    expect(rows.get("Epochs")).toBe("100");
    expect(rows.get("Image size")).toBe("640");
    expect(rows.get("Batch size")).toBe("Auto (16)");
    expect(rows.get("Device")).toBe("Auto (CPU)");
    expect(rows.get("Task type")).toBe("Detect");
    expect(rows.get("Dataset")).toBe("Train 120 · Valid 30 · Test 10");
    expect(rows.get("Classes")).toBe("car, plate");
    expect(rows.has("Created")).toBe(true);
    expect(rows.has("Started")).toBe(true);
    expect(rows.has("Finished")).toBe(true);
    expect(screen.getByText("car, plate")).toHaveAttribute("title", "car, plate");
  });

  it("shows a plain Auto before the worker resolved it and omits unknown times", async () => {
    stubTrainingApi({
      run: queued({ dataset_counts: { train: 5, valid: 2, test: 0 } }),
    });
    renderWithProviders(<AppRoutes />, { route: RUN_PATH });

    expect(await screen.findByText("Settings used")).toBeInTheDocument();
    const rows = settingsRows();
    expect(rows.get("Batch size")).toBe("Auto");
    expect(rows.get("Device")).toBe("Auto");
    expect(rows.has("Created")).toBe(true);
    expect(rows.has("Started")).toBe(false);
    expect(rows.has("Finished")).toBe(false);
  });

  it("shows explicit batch and GPU values as chosen", async () => {
    stubTrainingApi({
      run: completed({
        settings: { epochs: 10, imgsz: 320, batch: 8, device: "0" },
        resolved: { device: "0", batch: 8, workers: 2 },
        dataset_counts: { train: 1, valid: 1, test: 0 },
      }),
    });
    renderWithProviders(<AppRoutes />, { route: RUN_PATH });

    expect(await screen.findByText("Settings used")).toBeInTheDocument();
    const rows = settingsRows();
    expect(rows.get("Batch size")).toBe("8");
    expect(rows.get("Device")).toBe("GPU 0");
    expect(rows.get("Epochs")).toBe("10");
  });

  it("is also shown on failed runs and in Russian", async () => {
    stubTrainingApi({ run: failed() });
    renderWithProviders(<AppRoutes />, { route: RUN_PATH, language: "ru" });

    expect(await screen.findByText("Использованные настройки")).toBeInTheDocument();
    expect(await screen.findByText("Обучение не удалось")).toBeInTheDocument();
  });
});

describe("RunPage remove from queue", () => {
  it("opens a confirmation with Cancel focused, then removes the run and returns to the list", async () => {
    const stub = stubTrainingApi({ run: queued(), runs: [] });
    const view = renderWithProviders(<AppRoutes />, { route: RUN_PATH });

    await view.user.click(await screen.findByRole("button", { name: "Remove from queue" }));

    const dialog = await screen.findByRole("dialog", { name: "Remove from queue" });
    expect(
      within(dialog).getByText(
        'Run "run-7" will be removed from the queue and its prepared dataset will be deleted. This cannot be undone.',
      ),
    ).toBeInTheDocument();
    await waitFor(() => expect(within(dialog).getByRole("button", { name: "Cancel" })).toHaveFocus());

    await view.user.click(within(dialog).getByRole("button", { name: "Remove" }));

    expect(await screen.findByText("No training runs yet")).toBeInTheDocument();
    expect(stub.deletes).toEqual(["/api/projects/1/runs/7"]);
    expect(notifications.show).toHaveBeenCalledWith(
      expect.objectContaining({ color: "green", message: 'Run "run-7" was removed from the queue.' }),
    );
  });

  it("disables both buttons while the request is pending", async () => {
    let release: () => void = () => undefined;
    const removeGate = new Promise<void>((resolve) => {
      release = resolve;
    });
    stubTrainingApi({ run: queued(), runs: [], removeGate });
    const view = renderWithProviders(<AppRoutes />, { route: RUN_PATH });

    await view.user.click(await screen.findByRole("button", { name: "Remove from queue" }));
    const dialog = await screen.findByRole("dialog", { name: "Remove from queue" });
    await view.user.click(within(dialog).getByRole("button", { name: "Remove" }));

    await waitFor(() => expect(within(dialog).getByRole("button", { name: "Cancel" })).toBeDisabled());
    expect(within(dialog).getByRole("button", { name: /Remove/ })).toBeDisabled();

    release();
    expect(await screen.findByText("No training runs yet")).toBeInTheDocument();
  });

  it("keeps the modal open on a 409 with the API message and re-fetches the run on close", async () => {
    const stub = stubTrainingApi({ run: queued(), removeStatus: 409 });
    const view = renderWithProviders(<AppRoutes />, { route: RUN_PATH });

    await view.user.click(await screen.findByRole("button", { name: "Remove from queue" }));
    const dialog = await screen.findByRole("dialog", { name: "Remove from queue" });
    await view.user.click(within(dialog).getByRole("button", { name: "Remove" }));

    expect(
      await within(dialog).findByText(
        "This run has already started and can no longer be removed from the queue.",
      ),
    ).toBeInTheDocument();
    expect(screen.getByRole("dialog", { name: "Remove from queue" })).toBeInTheDocument();
    expect(notifications.show).not.toHaveBeenCalled();
    const before = stub.count("GET /api/projects/1/runs/7");

    await view.user.click(within(dialog).getByRole("button", { name: "Cancel" }));

    await waitFor(() => expect(stub.count("GET /api/projects/1/runs/7")).toBe(before + 1));
  });

  it("offers no remove button for preparing, running or completed runs", async () => {
    for (const run of [
      makeRun({ id: 7, name: "run-7", status: "preparing", queue_position: null }),
      running(),
      completed(),
    ]) {
      stubTrainingApi({ run });
      const view = renderWithProviders(<AppRoutes />, { route: RUN_PATH });
      await screen.findByText("Settings used");
      expect(screen.queryByRole("button", { name: "Remove from queue" })).toBeNull();
      view.unmount();
    }
  });
});
