import { act, screen, waitFor, within } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

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
