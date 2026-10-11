import { act, screen, waitFor, within } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("@mantine/notifications", () => ({
  notifications: { show: vi.fn() },
}));

import { notifications } from "@mantine/notifications";

import { RUN_POLL_INTERVAL_MS, RUN_SAFETY_POLL_INTERVAL_MS, runPollInterval } from "../../api/training";
import { AppRoutes } from "../../app/routes";
import { renderWithProviders } from "../../test/render";
import { FakeEventSource, latestEventSource } from "../../test/fakeEventSource";
import { useSizedRechartsContainers } from "../../test/rechartsSize";
import { makeRun, stubTrainingApi } from "../../test/trainingApi";

useSizedRechartsContainers();

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
    expect(screen.getByText("Final validation…")).toBeInTheDocument();
    expect(
      screen.getByText(
        "Checking the best model on the validation images. The model is registered right after.",
      ),
    ).toBeInTheDocument();
    expect(screen.queryByText(/Finishing/)).toBeNull();
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

function fitEpoch(epoch: number, map50: number, extra: Record<string, unknown> = {}) {
  return {
    event: "fit_epoch_end",
    epoch,
    epochs: 100,
    final_validation: false,
    primary: { precision: 0.8, recall: 0.7, map50, map50_95: map50 - 0.2 },
    ...extra,
  };
}

describe("RunPage live charts", () => {
  it("grows the mAP chart from the event stream, ignores the final validation and closes on end", async () => {
    stubTrainingApi({ run: running() });
    renderWithProviders(<AppRoutes />, { route: RUN_PATH });

    expect((await screen.findAllByText("Epoch 12 of 100")).length).toBeGreaterThan(0);
    await waitFor(() => expect(FakeEventSource.instances).toHaveLength(1));
    const source = latestEventSource();
    expect(source.url).toBe("/api/projects/1/runs/7/stream");
    expect(screen.queryByRole("group", { name: "mAP" })).toBeNull();

    act(() => {
      source.open();
      source.emit("progress", fitEpoch(1, 0.5), "100");
      source.emit("progress", fitEpoch(2, 0.6), "200");
    });

    expect(await screen.findByRole("group", { name: "mAP" })).toBeInTheDocument();
    expect(screen.getByText("Latest, epoch 2: mAP50 0.600, mAP50-95 0.400")).toBeInTheDocument();

    act(() => {
      source.emit("progress", fitEpoch(2, 0.7, { final_validation: true }), "300");
    });
    expect(screen.getByText("Latest, epoch 2: mAP50 0.600, mAP50-95 0.400")).toBeInTheDocument();
    expect(source.readyState).toBe(FakeEventSource.OPEN);

    act(() => {
      source.emit("end", { status: "completed" });
    });
    expect(source.readyState).toBe(FakeEventSource.CLOSED);
  });

  it("shows the categorized failure at once when a status frame reports the run failed", async () => {
    stubTrainingApi({ run: running() });
    renderWithProviders(<AppRoutes />, { route: RUN_PATH });

    await waitFor(() => expect(FakeEventSource.instances).toHaveLength(1));
    const source = latestEventSource();
    act(() => {
      source.open();
      source.emit("status", { status: "failed", epoch: 12, epochs: 100, error_category: "disk_full" });
    });

    expect(await screen.findByText("Disk is full")).toBeInTheDocument();
  });

  it("opens one stream per page and closes it on unmount", async () => {
    stubTrainingApi({ run: running() });
    const view = renderWithProviders(<AppRoutes />, { route: RUN_PATH });

    await waitFor(() => expect(FakeEventSource.instances).toHaveLength(1));
    view.unmount();

    expect(latestEventSource().readyState).toBe(FakeEventSource.CLOSED);
    expect(FakeEventSource.instances).toHaveLength(1);
  });

  it("opens no stream for a run that is still queued", async () => {
    stubTrainingApi({
      run: makeRun({ id: 7, name: "run-7", status: "queued", queue_position: 2 }),
    });
    renderWithProviders(<AppRoutes />, { route: RUN_PATH });

    expect(await screen.findByText("In queue: position 2")).toBeInTheDocument();
    expect(FakeEventSource.instances).toHaveLength(0);
  });
});

function trainStart(time: number, extra: Record<string, unknown> = {}) {
  return { event: "train_start", v: 2, epochs: 10, start_epoch: 0, resumed: false, nb: 10, time, ...extra };
}

function batchEvent(epoch: number, batch: number, time: number, nb = 10) {
  return { event: "batch_progress", v: 2, epoch, epochs: 10, batch, nb, time };
}

describe("RunPage batch progress and ETA", () => {
  async function openStream() {
    stubTrainingApi({ run: running({ epoch: 1, epochs: 10 }) });
    renderWithProviders(<AppRoutes />, { route: RUN_PATH });
    expect((await screen.findAllByText("Epoch 1 of 10")).length).toBeGreaterThan(0);
    await waitFor(() => expect(FakeEventSource.instances).toHaveLength(1));
    const source = latestEventSource();
    act(() => {
      source.open();
    });
    return source;
  }

  it("shows no batch bar and an unknown time left before the first batch event", async () => {
    const source = await openStream();
    act(() => {
      source.emit("progress", trainStart(1000), "10");
    });

    expect(screen.getAllByRole("progressbar")).toHaveLength(1);
    expect(screen.queryByText(/Batch \d+ of/)).toBeNull();
    expect(screen.getByText(/Time left: —/)).toBeInTheDocument();
  });

  it("adds a neutral batch bar with its caption and a time left once a batch event arrives", async () => {
    const source = await openStream();
    act(() => {
      source.emit("progress", trainStart(1000), "10");
      source.emit("progress", batchEvent(1, 3, 1030), "20");
    });

    const bar = await screen.findByRole("progressbar", { name: "Batch 3 of 10" });
    expect(bar).toHaveAttribute("aria-valuenow", "3");
    expect(bar).toHaveAttribute("aria-valuemax", "10");
    expect(bar).toHaveAttribute("aria-live", "off");
    expect(screen.getAllByRole("progressbar")).toHaveLength(2);
    expect(screen.getByText("Batch 3 of 10")).toBeInTheDocument();
    // 30 s for 3 of 10 batches: an epoch costs 100 s, 9.7 epochs are left.
    expect(screen.getByText(/Time left: ~0:16:10/)).toBeInTheDocument();
    expect(screen.getByText("Latest mAP50: 0.457")).toBeInTheDocument();
  });

  it("restarts the batch bar at each epoch and reads Batch 1 of 1 for a one-batch epoch", async () => {
    const source = await openStream();
    act(() => {
      source.emit("progress", trainStart(1000, { nb: 1 }), "10");
      source.emit("progress", batchEvent(1, 1, 1010, 1), "20");
    });
    const full = await screen.findByRole("progressbar", { name: "Batch 1 of 1" });
    expect(full).toHaveAttribute("aria-valuenow", "1");
    expect(full).toHaveAttribute("aria-valuemax", "1");

    act(() => {
      source.emit("progress", batchEvent(2, 1, 1020, 4), "30");
    });
    const restarted = await screen.findByRole("progressbar", { name: "Batch 1 of 4" });
    expect(restarted).toHaveAttribute("aria-valuenow", "1");
  });

  it("notes a resume and measures the new segment from its own start", async () => {
    const source = await openStream();
    act(() => {
      source.emit("progress", trainStart(1000), "10");
      source.emit("progress", { event: "train_epoch_end", epoch: 1, epochs: 10, tloss: {}, time: 1100 }, "20");
      source.emit("progress", trainStart(9000, { start_epoch: 1, resumed: true }), "30");
      source.emit("progress", batchEvent(2, 5, 9050), "40");
    });

    expect(await screen.findByText("Resumed from epoch 1.")).toBeInTheDocument();
    // 50 s for half an epoch: 100 s per epoch, (10 - 1 - 0.5) x 100.
    expect(screen.getByText(/Time left: ~0:14:10/)).toBeInTheDocument();
  });

  it("labels the batch bar and the time left in Russian", async () => {
    stubTrainingApi({ run: running({ epoch: 1, epochs: 10 }) });
    renderWithProviders(<AppRoutes />, { route: RUN_PATH, language: "ru" });
    await waitFor(() => expect(FakeEventSource.instances).toHaveLength(1));
    const source = latestEventSource();
    act(() => {
      source.open();
      source.emit("progress", trainStart(1000), "10");
      source.emit("progress", batchEvent(1, 3, 1030), "20");
    });

    expect(await screen.findByRole("progressbar", { name: "Батч 3 из 10" })).toBeInTheDocument();
    expect(screen.getByText(/Осталось: ~0:16:10/)).toBeInTheDocument();
  });
});

const FINAL_PRIMARY = { precision: 0.91, recall: 0.82, map50: 0.873, map50_95: 0.614 };

function lastRealEpoch(epoch: number, epochs: number) {
  return {
    event: "fit_epoch_end",
    v: 2,
    epoch,
    epochs,
    final_validation: false,
    last_epoch: true,
    fitness: 0.5,
    primary: { precision: 0.8, recall: 0.7, map50: 0.6, map50_95: 0.4 },
  };
}

function finalValidation(epoch: number, epochs: number) {
  return {
    event: "fit_epoch_end",
    v: 2,
    epoch,
    epochs,
    final_validation: true,
    primary: FINAL_PRIMARY,
  };
}

describe("RunPage final validation", () => {
  it("reads Final validation after the last real epoch: full epoch bar, no batch bar, no time left, never epoch 11", async () => {
    // The poll still says 9 completed epochs; the stream knows the 10th was the last one.
    stubTrainingApi({ run: running({ epoch: 9, epochs: 10 }) });
    renderWithProviders(<AppRoutes />, { route: RUN_PATH });

    expect((await screen.findAllByText("Epoch 9 of 10")).length).toBeGreaterThan(0);
    await waitFor(() => expect(FakeEventSource.instances).toHaveLength(1));
    const source = latestEventSource();
    act(() => {
      source.open();
      source.emit("progress", trainStart(1000), "10");
      source.emit("progress", batchEvent(10, 7, 1900), "20");
    });
    expect(await screen.findByRole("progressbar", { name: "Batch 7 of 10" })).toBeInTheDocument();

    act(() => {
      source.emit("progress", lastRealEpoch(10, 10), "30");
    });

    expect(await screen.findByText("Final validation…")).toBeInTheDocument();
    expect(
      screen.getByText(
        "Checking the best model on the validation images. The model is registered right after.",
      ),
    ).toBeInTheDocument();
    expect(screen.getAllByText("Epoch 10 of 10").length).toBeGreaterThan(0);
    expect(screen.queryByText("Epoch 11 of 10")).toBeNull();
    expect(screen.queryByRole("progressbar", { name: /Batch/ })).toBeNull();
    expect(screen.queryByText(/Time left/)).toBeNull();
    const bar = screen.getByRole("progressbar");
    expect(bar).toHaveAttribute("aria-valuenow", "10");
    expect(bar).toHaveAttribute("aria-valuemax", "10");
  });

  it("shows the final results card from the final-validation event while the run is still running", async () => {
    stubTrainingApi({ run: running({ epoch: 10, epochs: 10 }) });
    renderWithProviders(<AppRoutes />, { route: RUN_PATH });

    expect((await screen.findAllByText("Epoch 10 of 10")).length).toBeGreaterThan(0);
    await waitFor(() => expect(FakeEventSource.instances).toHaveLength(1));
    const source = latestEventSource();
    act(() => {
      source.open();
      source.emit("progress", lastRealEpoch(10, 10), "10");
    });
    expect(screen.queryByText("Final results (best.pt)")).toBeNull();

    act(() => {
      source.emit("progress", finalValidation(10, 10), "20");
    });

    const card = await screen.findByTestId("final-results");
    expect(within(card).getByText("Final results (best.pt)")).toBeInTheDocument();
    expect(
      within(card).getByText("Final validation of the best checkpoint on the validation images."),
    ).toBeInTheDocument();
    for (const value of ["0.910", "0.820", "0.873", "0.614"]) {
      expect(within(card).getByText(value)).toBeInTheDocument();
    }
    expect(within(card).queryByText("Good result")).toBeNull();
    expect(screen.getByText("Final validation…")).toBeInTheDocument();
  });

  it("shows a dash for a metric the final event does not carry and no verdict", async () => {
    stubTrainingApi({ run: running({ epoch: 10, epochs: 10 }) });
    renderWithProviders(<AppRoutes />, { route: RUN_PATH });

    await waitFor(() => expect(FakeEventSource.instances).toHaveLength(1));
    const source = latestEventSource();
    act(() => {
      source.open();
      source.emit(
        "progress",
        {
          ...finalValidation(10, 10),
          primary: { precision: 0.9, recall: null, map50: 0.8, map50_95: 0.5 },
        },
        "10",
      );
    });

    const card = await screen.findByTestId("final-results");
    expect(within(card).getByTestId("metric-recall")).toHaveTextContent("—");
    expect(within(card).getByTestId("metric-map50")).toHaveTextContent("0.800");
  });

  it("moves the four tiles and the verdict out of the completed status card into the final results card", async () => {
    stubTrainingApi({ run: completed() });
    renderWithProviders(<AppRoutes />, { route: RUN_PATH });

    expect(await screen.findByText("Training complete")).toBeInTheDocument();
    const card = screen.getByTestId("final-results");
    expect(within(card).getByText("Final results (best.pt)")).toBeInTheDocument();
    for (const value of ["0.900", "0.800", "0.812", "0.500"]) {
      expect(within(card).getByText(value)).toBeInTheDocument();
    }
    expect(within(card).getByText("Good result")).toBeInTheDocument();
    expect(within(card).getByText("Verdict is based on mAP50.")).toBeInTheDocument();
    expect(screen.getAllByTestId("metric-map50")).toHaveLength(1);
    expect(card.contains(screen.getByText("Training complete"))).toBe(false);
  });

  it("puts the final results card between the status card and the charts", async () => {
    stubTrainingApi({ run: completed({ epochs: 10 }) });
    renderWithProviders(<AppRoutes />, { route: RUN_PATH });

    const status = await screen.findByText("Training complete");
    await waitFor(() => expect(FakeEventSource.instances).toHaveLength(1));
    act(() => {
      latestEventSource().open();
      latestEventSource().emit("progress", fitEpochWithLoss(1, 0.5), "10");
    });
    const charts = await screen.findByRole("group", { name: "mAP" });
    const card = screen.getByTestId("final-results");
    const settings = screen.getByTestId("run-settings");

    expect(status.compareDocumentPosition(card) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(card.compareDocumentPosition(charts) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(charts.compareDocumentPosition(settings) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });

  it("explains an early stop without rendering it as an error", async () => {
    stubTrainingApi({ run: completed({ epoch: 7, epochs: 10 }) });
    renderWithProviders(<AppRoutes />, { route: RUN_PATH });

    expect(
      await screen.findByText(
        "Training stopped early at epoch 7 of 10 because the metrics stopped improving.",
      ),
    ).toBeInTheDocument();
    expect(screen.queryByRole("alert")).toBeNull();
  });

  it("does not mention an early stop when every planned epoch ran", async () => {
    stubTrainingApi({ run: completed() });
    renderWithProviders(<AppRoutes />, { route: RUN_PATH });

    expect(await screen.findByText("Training complete")).toBeInTheDocument();
    expect(screen.queryByText(/stopped early/)).toBeNull();
  });

  it("renders no final results card for failed, cancelled or interrupted runs, even with a final event in the stream", async () => {
    for (const status of ["failed", "cancelled", "interrupted"] as const) {
      stubTrainingApi({
        run: makeRun({ id: 7, name: "run-7", status, queue_position: null, epoch: 10, epochs: 10 }),
      });
      const view = renderWithProviders(<AppRoutes />, { route: RUN_PATH });
      await waitFor(() => expect(FakeEventSource.instances.length).toBeGreaterThan(0));
      act(() => {
        latestEventSource().open();
        latestEventSource().emit("progress", finalValidation(10, 10), "10");
      });
      await screen.findByText("Settings used");

      expect(screen.queryByTestId("final-results")).toBeNull();
      expect(screen.queryByText("Final results (best.pt)")).toBeNull();
      view.unmount();
    }
  });

  it("labels the final validation and the final results card in Russian", async () => {
    stubTrainingApi({ run: running({ epoch: 10, epochs: 10 }) });
    renderWithProviders(<AppRoutes />, { route: RUN_PATH, language: "ru" });

    await waitFor(() => expect(FakeEventSource.instances).toHaveLength(1));
    const source = latestEventSource();
    act(() => {
      source.open();
      source.emit("progress", lastRealEpoch(10, 10), "10");
      source.emit("progress", finalValidation(10, 10), "20");
    });

    expect(await screen.findByText("Итоговая валидация…")).toBeInTheDocument();
    expect(await screen.findByText("Итоговые результаты (best.pt)")).toBeInTheDocument();
  });
});

function trainEpoch(epoch: number, loss: number) {
  return {
    event: "train_epoch_end",
    epoch,
    epochs: 10,
    tloss: { box_loss: loss * 0.5, cls_loss: loss * 0.3, dfl_loss: loss * 0.2 },
  };
}

function fitEpochWithLoss(epoch: number, map50: number) {
  return {
    event: "fit_epoch_end",
    epoch,
    epochs: 10,
    final_validation: false,
    metrics: { "val/box_loss": 0.4, "val/cls_loss": 0.3, "val/dfl_loss": 0.2 },
    primary: { precision: 0.8, recall: 0.7, map50, map50_95: map50 - 0.2 },
  };
}

describe("RunPage history charts", () => {
  it("rebuilds the loss, mAP and precision/recall charts of a finished run from the replay", async () => {
    stubTrainingApi({ run: completed({ epochs: 10, settings: { epochs: 10, imgsz: 640, batch: -1, device: "auto" } }) });
    renderWithProviders(<AppRoutes />, { route: RUN_PATH });

    await waitFor(() => expect(FakeEventSource.instances).toHaveLength(1));
    const source = latestEventSource();
    act(() => {
      source.open();
      for (const epoch of [1, 2, 3]) {
        source.emit("progress", trainEpoch(epoch, 3 - epoch * 0.5), String(epoch * 100));
        source.emit("progress", fitEpochWithLoss(epoch, 0.3 + epoch * 0.1), String(epoch * 100 + 50));
      }
      source.emit("end", { status: "completed" });
    });

    for (const [name, labels] of [
      ["Loss", ["Train", "Validation"]],
      ["mAP", ["mAP50", "mAP50-95"]],
      ["Precision and recall", ["Precision", "Recall"]],
    ] as const) {
      const group = await screen.findByRole("group", { name });
      for (const label of labels) {
        expect(within(group).getAllByText(label).length).toBeGreaterThan(0);
      }
    }
    expect(screen.getByText("Latest, epoch 3: Train 1.500, Validation 0.900")).toBeInTheDocument();
    expect(screen.getByText("Latest, epoch 3: mAP50 0.600, mAP50-95 0.400")).toBeInTheDocument();
    expect(screen.getByText("Latest, epoch 3: Precision 0.800, Recall 0.700")).toBeInTheDocument();
    // The X axis spans the planned epochs, not only the epochs reached.
    expect(within(screen.getByRole("group", { name: "mAP" })).getByText("10")).toBeInTheDocument();
  });

  it("renders the same charts for a Phase 4 history without v, batch events or fitness", async () => {
    stubTrainingApi({ run: completed({ epochs: 10 }) });
    renderWithProviders(<AppRoutes />, { route: RUN_PATH });

    await waitFor(() => expect(FakeEventSource.instances).toHaveLength(1));
    const source = latestEventSource();
    act(() => {
      source.open();
      source.emit("progress", {
        event: "fit_epoch_end",
        epoch: 1,
        epochs: 10,
        primary: { precision: 0.5, recall: 0.4, map50: 0.3, map50_95: 0.2 },
      });
    });

    expect(await screen.findByRole("group", { name: "Loss" })).toBeInTheDocument();
    expect(screen.getByRole("group", { name: "mAP" })).toBeInTheDocument();
    expect(screen.getByRole("group", { name: "Precision and recall" })).toBeInTheDocument();
  });

  it("labels the charts in Russian", async () => {
    stubTrainingApi({ run: completed({ epochs: 10 }) });
    renderWithProviders(<AppRoutes />, { route: RUN_PATH, language: "ru" });

    await waitFor(() => expect(FakeEventSource.instances).toHaveLength(1));
    const source = latestEventSource();
    act(() => {
      source.open();
      source.emit("progress", fitEpochWithLoss(1, 0.5));
    });

    expect(await screen.findByRole("group", { name: "Потери" })).toBeInTheDocument();
    expect(screen.getByRole("group", { name: "Precision и recall" })).toBeInTheDocument();
  });
});

describe("RunPage stream states", () => {
  it("shows three skeleton charts until the stream opens, then the waiting panel for a running run", async () => {
    stubTrainingApi({ run: running() });
    renderWithProviders(<AppRoutes />, { route: RUN_PATH });

    expect(await screen.findAllByTestId("chart-skeleton")).toHaveLength(3);
    expect(screen.queryByText("Charts appear after the first epoch finishes.")).toBeNull();

    act(() => {
      latestEventSource().open();
    });

    expect(await screen.findByText("Charts appear after the first epoch finishes.")).toBeInTheDocument();
    expect(screen.queryByTestId("chart-skeleton")).toBeNull();
  });

  it("renders no chart section for a finished run whose history has no epoch", async () => {
    stubTrainingApi({ run: completed() });
    renderWithProviders(<AppRoutes />, { route: RUN_PATH });

    await waitFor(() => expect(FakeEventSource.instances).toHaveLength(1));
    act(() => {
      latestEventSource().open();
      latestEventSource().emit("end", { status: "completed" });
    });

    await waitFor(() => expect(screen.queryByTestId("chart-skeleton")).toBeNull());
    expect(screen.queryByText("Charts appear after the first epoch finishes.")).toBeNull();
    expect(screen.queryByRole("group", { name: "mAP" })).toBeNull();
  });

  it("shows Reconnecting while the browser retries and keeps the charts", async () => {
    stubTrainingApi({ run: running() });
    renderWithProviders(<AppRoutes />, { route: RUN_PATH });

    await waitFor(() => expect(FakeEventSource.instances).toHaveLength(1));
    const source = latestEventSource();
    act(() => {
      source.open();
      source.emit("progress", fitEpoch(1, 0.5), "100");
    });
    expect(await screen.findByRole("group", { name: "mAP" })).toBeInTheDocument();

    act(() => {
      source.fail(FakeEventSource.CONNECTING);
    });
    expect(await screen.findByText("Reconnecting…")).toBeInTheDocument();
    expect(screen.getByRole("group", { name: "mAP" })).toBeInTheDocument();

    act(() => {
      source.open();
    });
    await waitFor(() => expect(screen.queryByText("Reconnecting…")).toBeNull());
  });

  it("keeps the last data when the stream closes for good and reopens it on Try again", async () => {
    stubTrainingApi({ run: running() });
    const view = renderWithProviders(<AppRoutes />, { route: RUN_PATH });

    await waitFor(() => expect(FakeEventSource.instances).toHaveLength(1));
    const source = latestEventSource();
    act(() => {
      source.open();
      source.emit("progress", fitEpoch(1, 0.5), "100");
    });
    expect(await screen.findByRole("group", { name: "mAP" })).toBeInTheDocument();

    act(() => {
      source.fail(FakeEventSource.CLOSED);
    });
    const message = await screen.findByText(
      "Live updates are unavailable. Charts show data up to the last update.",
    );
    expect(screen.getByRole("group", { name: "mAP" })).toBeInTheDocument();

    await view.user.click(within(message.closest("[role='status']") as HTMLElement).getByRole("button", { name: "Try again" }));

    await waitFor(() => expect(FakeEventSource.instances).toHaveLength(2));
    expect(source.readyState).toBe(FakeEventSource.CLOSED);
    expect(latestEventSource().url).toBe("/api/projects/1/runs/7/stream");
  });

  it("polls a running run every 15 seconds while the stream is healthy and every 3 seconds when it is down", async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    const stub = stubTrainingApi({ run: running() });
    renderWithProviders(<AppRoutes />, { route: RUN_PATH });

    expect((await screen.findAllByText("Epoch 12 of 100")).length).toBeGreaterThan(0);
    await waitFor(() => expect(FakeEventSource.instances).toHaveLength(1));
    act(() => {
      latestEventSource().open();
    });
    await act(async () => {
      await vi.advanceTimersByTimeAsync(4000);
    });
    expect(stub.count("GET /api/projects/1/runs/7")).toBe(1);

    await act(async () => {
      await vi.advanceTimersByTimeAsync(12000);
    });
    await waitFor(() => expect(stub.count("GET /api/projects/1/runs/7")).toBe(2));

    act(() => {
      latestEventSource().fail(FakeEventSource.CLOSED);
    });
    const before = stub.count("GET /api/projects/1/runs/7");
    await act(async () => {
      await vi.advanceTimersByTimeAsync(3100);
    });
    await waitFor(() => expect(stub.count("GET /api/projects/1/runs/7")).toBeGreaterThan(before));
  });
});

describe("runPollInterval", () => {
  it("is 15 s for a running run with a healthy stream and 3 s otherwise while the run is active", () => {
    expect(runPollInterval({ status: "running" }, true)).toBe(RUN_SAFETY_POLL_INTERVAL_MS);
    expect(RUN_SAFETY_POLL_INTERVAL_MS).toBe(15000);
    expect(runPollInterval({ status: "running" }, false)).toBe(RUN_POLL_INTERVAL_MS);
    expect(runPollInterval({ status: "queued" }, true)).toBe(RUN_POLL_INTERVAL_MS);
    expect(runPollInterval({ status: "preparing" }, true)).toBe(RUN_POLL_INTERVAL_MS);
  });

  it("stops for a finished run and before the first answer", () => {
    for (const status of ["completed", "failed", "cancelled", "interrupted"] as const) {
      expect(runPollInterval({ status }, false)).toBe(false);
    }
    expect(runPollInterval(undefined, true)).toBe(false);
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
    error_category: "out_of_memory",
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

    expect(await screen.findByText("Out of memory")).toBeInTheDocument();
    expect(screen.getByText("CUDA out of memory.", { selector: "div,p" })).toBeInTheDocument();
    // Collapse may mount its hidden content a render pass later; either way it is not shown.
    const hiddenTitle = screen.queryByText("Last log lines");
    if (hiddenTitle !== null) {
      expect(hiddenTitle).not.toBeVisible();
    }
    expect(screen.queryByRole("button", { name: "Copy log" })).toBeNull();

    await view.user.click(screen.getByRole("button", { name: "Show log" }));

    // Collapse reveals its content after a render pass.
    await waitFor(() => expect(screen.getByText("Last log lines")).toBeVisible());
    expect(screen.getByText(/epoch 1\/3/)).toBeVisible();
    expect(await screen.findByRole("button", { name: "Copy log" })).toBeVisible();
    expect(screen.getByRole("button", { name: "Hide log" })).toBeInTheDocument();
  });

  it("titles an out-of-memory failure, says what to do and keeps the original message and log", async () => {
    stubTrainingApi({ run: failed() });
    renderWithProviders(<AppRoutes />, { route: RUN_PATH });

    expect(await screen.findByText("Out of memory")).toBeInTheDocument();
    expect(
      screen.getByText(
        "The GPU or the system ran out of memory. Start a new run with a smaller batch size or image size, or pick a smaller model.",
      ),
    ).toBeInTheDocument();
    expect(screen.getByText("Original message")).toBeInTheDocument();
    expect(screen.getByText("CUDA out of memory.", { selector: "div,p" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Show log" })).toBeInTheDocument();
  });

  it("shows 'Unexpected error' with the raw message when the run has no category", async () => {
    stubTrainingApi({ run: failed({ error_category: null, error_message: "Something odd." }) });
    renderWithProviders(<AppRoutes />, { route: RUN_PATH });

    expect(await screen.findByText("Unexpected error")).toBeInTheDocument();
    expect(
      screen.getByText("Open the log below for details. If it keeps happening, start a new run."),
    ).toBeInTheDocument();
    expect(screen.getByText("Something odd.", { selector: "div,p" })).toBeInTheDocument();
  });

  it.each([
    ["out_of_memory", "Out of memory", "ran out of memory"],
    ["disk_full", "Disk is full", "no free space left for training files"],
    ["invalid_dataset", "Invalid dataset", "could not read the dataset"],
    ["weights_download", "Could not download model weights", "downloaded on first use"],
    ["process_killed", "Training process was killed", "stopped the training process"],
    ["not_resumable", "Cannot resume", "checkpoint is missing, damaged"],
    ["unknown", "Unexpected error", "Open the log below for details"],
  ])("renders its own title and hint for %s", async (code, title, hintPart) => {
    stubTrainingApi({ run: failed({ error_category: code, error_message: `raw ${code}` }) });
    renderWithProviders(<AppRoutes />, { route: RUN_PATH });

    expect(await screen.findByText(title)).toBeInTheDocument();
    expect(screen.getByText(new RegExp(hintPart, "i"))).toBeInTheDocument();
    expect(screen.getByText("Original message")).toBeInTheDocument();
    expect(screen.getByText(`raw ${code}`, { selector: "div,p" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Show log" })).toBeInTheDocument();
  });

  it("renders an unrecognized category as 'Unexpected error' with the raw message", async () => {
    stubTrainingApi({
      run: failed({ error_category: "brand_new_code", error_message: "New kind of failure." }),
    });
    renderWithProviders(<AppRoutes />, { route: RUN_PATH });

    expect(await screen.findByText("Unexpected error")).toBeInTheDocument();
    expect(screen.queryByText("brand_new_code")).toBeNull();
    expect(screen.getByText("New kind of failure.", { selector: "div,p" })).toBeInTheDocument();
  });

  it("shows the Russian title and hint of a category", async () => {
    stubTrainingApi({ run: failed({ error_category: "disk_full" }) });
    renderWithProviders(<AppRoutes />, { route: RUN_PATH, language: "ru" });

    expect(await screen.findByText("Закончилось место на диске")).toBeInTheDocument();
    expect(screen.getByText(/Освободите место в папке данных \(DATA_DIR\)/)).toBeInTheDocument();
    expect(screen.getByText("Исходное сообщение")).toBeInTheDocument();
  });

  it("wraps a 10,000-character raw message inside the alert instead of widening the page", async () => {
    const long = "x".repeat(10_000);
    stubTrainingApi({ run: failed({ error_message: long }) });
    renderWithProviders(<AppRoutes />, { route: RUN_PATH });

    const message = await screen.findByText(long, { selector: "div,p" });
    expect(message).toHaveStyle({ whiteSpace: "pre-wrap", overflowWrap: "anywhere" });
  });

  it("copies the log", async () => {
    stubTrainingApi({ run: failed() });
    const view = renderWithProviders(<AppRoutes />, { route: RUN_PATH });

    await view.user.click(await screen.findByRole("button", { name: "Show log" }));
    await view.user.click(await screen.findByRole("button", { name: "Copy log" }));

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
    await waitFor(() => expect(screen.getByText("The log is empty.")).toBeVisible());
    expect(screen.queryByRole("button", { name: "Copy log" })).toBeNull();
  });

  it("shows an empty-string log as empty too", async () => {
    stubTrainingApi({ run: failed({ log_tail: "" }) });
    const view = renderWithProviders(<AppRoutes />, { route: RUN_PATH });

    await view.user.click(await screen.findByRole("button", { name: "Show log" }));

    await waitFor(() => expect(screen.getByText("The log is empty.")).toBeVisible());
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
  it("explains a restart, the last epoch and offers a new run", async () => {
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
    expect(await screen.findByText("Не хватило памяти")).toBeInTheDocument();
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

describe("RunPage cancelling and cancelled states", () => {
  it("reads Cancelling… in the status badge of the header and of the run list", async () => {
    stubTrainingApi({
      run: running({ cancelling: true }),
      runs: [running({ cancelling: true })],
    });
    const view = renderWithProviders(<AppRoutes />, { route: RUN_PATH });

    const heading = await screen.findByRole("heading", { level: 2, name: "run-7" });
    const badgeRow = heading.parentElement as HTMLElement;
    expect(within(badgeRow).getByText("Cancelling…")).toBeInTheDocument();
    // the running epoch label is replaced, not shown next to it
    expect(within(badgeRow).queryByText("Epoch 12 of 100")).toBeNull();
    view.unmount();

    renderWithProviders(<AppRoutes />, { route: "/projects/1/training" });
    const row = await screen.findByTestId("run-row");
    expect(within(row).getByText("Cancelling…")).toBeInTheDocument();
    expect(within(row).queryByText(/Epoch 12/)).toBeNull();
  });

  it("reads Cancelled in the badge of a cancelled run", async () => {
    stubTrainingApi({
      run: makeRun({ id: 7, name: "run-7", status: "cancelled", queue_position: null }),
    });
    renderWithProviders(<AppRoutes />, { route: RUN_PATH });

    const heading = await screen.findByRole("heading", { level: 2, name: "run-7" });
    expect(within(heading.parentElement as HTMLElement).getByText("Cancelled")).toBeInTheDocument();
  });

  it("announces Run cancelled politely when a running run becomes cancelled", async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    let current = running({ cancelling: true });
    stubTrainingApi({ run: () => current });
    renderWithProviders(<AppRoutes />, { route: RUN_PATH });

    expect((await screen.findAllByText("Cancelling…")).length).toBeGreaterThan(0);
    const region = screen.getByTestId("run-live-region");
    expect(region.textContent).toBe("");

    current = makeRun({ id: 7, name: "run-7", status: "cancelled", queue_position: null, epoch: 12 });
    await act(async () => {
      await vi.advanceTimersByTimeAsync(3100);
    });

    await waitFor(() => expect(region).toHaveTextContent("Run cancelled"));
  });

  it("shows Отменяется… in Russian while a cancel waits for the worker", async () => {
    stubTrainingApi({ run: running({ cancelling: true }) });
    renderWithProviders(<AppRoutes />, { route: RUN_PATH, language: "ru" });

    expect((await screen.findAllByText("Отменяется…")).length).toBeGreaterThan(0);
    expect(
      screen.getByText("Останавливаем процесс обучения. Это займёт несколько секунд."),
    ).toBeInTheDocument();
  });
});

describe("RunPage cancel training", () => {
  it("opens a confirmation with Keep training focused, sends the cancel and shows Cancelling…", async () => {
    let current = running({ epoch: 2, epochs: 10, settings: { epochs: 10, imgsz: 640, batch: -1, device: "auto" } });
    const stub = stubTrainingApi({
      run: () => current,
      cancelResult: running({ epoch: 2, epochs: 10, cancelling: true }),
    });
    const view = renderWithProviders(<AppRoutes />, { route: RUN_PATH });

    const open = await screen.findByRole("button", { name: "Cancel training" });
    await view.user.click(open);

    const dialog = await screen.findByRole("dialog", { name: "Cancel training" });
    expect(
      within(dialog).getByText(
        "Training will stop at epoch 3. You can resume it from the last checkpoint.",
      ),
    ).toBeInTheDocument();
    expect(within(dialog).getByText("The epoch in progress is not saved.")).toBeInTheDocument();
    await waitFor(() =>
      expect(within(dialog).getByRole("button", { name: "Keep training" })).toHaveFocus(),
    );

    current = running({ epoch: 2, epochs: 10, cancelling: true });
    await view.user.click(within(dialog).getByRole("button", { name: "Cancel training" }));

    expect(stub.cancels).toEqual(["/api/projects/1/runs/7/cancel"]);
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
    expect((await screen.findAllByText("Cancelling…")).length).toBeGreaterThan(0);
    expect(
      screen.getByText("Stopping the training process. This takes a few seconds."),
    ).toBeInTheDocument();
    const header = screen.getByRole("button", { name: "Cancelling…" });
    expect(header).toBeDisabled();
    expect(screen.queryByRole("button", { name: "Cancel training" })).toBeNull();
    // no epoch bar, ETA or batch caption while the worker stops the process
    expect(screen.queryByRole("progressbar")).toBeNull();
    expect(screen.queryByText(/Time left/)).toBeNull();
    expect(notifications.show).not.toHaveBeenCalled();
  });

  it("caps the epoch in the confirmation at the planned total", async () => {
    stubTrainingApi({ run: running({ epoch: 10, epochs: 10 }) });
    const view = renderWithProviders(<AppRoutes />, { route: RUN_PATH });

    await view.user.click(await screen.findByRole("button", { name: "Cancel training" }));

    const dialog = await screen.findByRole("dialog", { name: "Cancel training" });
    expect(within(dialog).getByText(/Training will stop at epoch 10\./)).toBeInTheDocument();
  });

  it("disables both buttons while the request is pending", async () => {
    let release: () => void = () => undefined;
    const cancelGate = new Promise<void>((resolve) => {
      release = resolve;
    });
    stubTrainingApi({ run: running(), cancelGate });
    const view = renderWithProviders(<AppRoutes />, { route: RUN_PATH });

    await view.user.click(await screen.findByRole("button", { name: "Cancel training" }));
    const dialog = await screen.findByRole("dialog", { name: "Cancel training" });
    await view.user.click(within(dialog).getByRole("button", { name: "Cancel training" }));

    await waitFor(() =>
      expect(within(dialog).getByRole("button", { name: "Keep training" })).toBeDisabled(),
    );
    expect(within(dialog).getByRole("button", { name: /Cancel training/ })).toBeDisabled();

    release();
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
  });

  it("offers no cancel button for preparing, queued, completed, failed, interrupted or cancelled runs", async () => {
    for (const status of [
      "preparing",
      "queued",
      "completed",
      "failed",
      "interrupted",
      "cancelled",
    ] as const) {
      stubTrainingApi({ run: makeRun({ id: 7, name: "run-7", status, queue_position: null }) });
      const view = renderWithProviders(<AppRoutes />, { route: RUN_PATH });
      await screen.findByText("Settings used");
      expect(screen.queryByRole("button", { name: /Cancel training|Cancelling/ })).toBeNull();
      view.unmount();
    }
  });

  it("offers no cancel button in the run list", async () => {
    stubTrainingApi({ runs: [running()] });
    renderWithProviders(<AppRoutes />, { route: "/projects/1/training" });

    expect(await screen.findByTestId("run-row")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /Cancel training/ })).toBeNull();
  });

  it("keeps the modal open on a 409 with the API message and re-fetches the run on close", async () => {
    const stub = stubTrainingApi({ run: running(), cancelStatus: 409 });
    const view = renderWithProviders(<AppRoutes />, { route: RUN_PATH });

    await view.user.click(await screen.findByRole("button", { name: "Cancel training" }));
    const dialog = await screen.findByRole("dialog", { name: "Cancel training" });
    await view.user.click(within(dialog).getByRole("button", { name: "Cancel training" }));

    expect(
      await within(dialog).findByText("Only a running run can be cancelled."),
    ).toBeInTheDocument();
    expect(screen.getByRole("dialog", { name: "Cancel training" })).toBeInTheDocument();
    const before = stub.count("GET /api/projects/1/runs/7");

    await view.user.click(within(dialog).getByRole("button", { name: "Keep training" }));

    await waitFor(() => expect(stub.count("GET /api/projects/1/runs/7")).toBe(before + 1));
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
  });

  it("words the confirmation in Russian", async () => {
    stubTrainingApi({ run: running({ epoch: 2, epochs: 10 }) });
    const view = renderWithProviders(<AppRoutes />, { route: RUN_PATH, language: "ru" });

    await view.user.click(await screen.findByRole("button", { name: "Отменить обучение" }));

    const dialog = await screen.findByRole("dialog", { name: "Отмена обучения" });
    expect(
      within(dialog).getByText(
        "Обучение остановится на эпохе 3. Вы сможете возобновить его с последней контрольной точки.",
      ),
    ).toBeInTheDocument();
    expect(within(dialog).getByRole("button", { name: "Продолжить обучение" })).toBeInTheDocument();
  });
});

function resumable(status: "interrupted" | "cancelled" | "failed", overrides = {}) {
  return makeRun({
    id: 7,
    name: "run-7",
    status,
    queue_position: null,
    epoch: 3,
    epochs: 10,
    started_at: STARTED_AT,
    finished_at: "2026-01-15T10:20:00Z",
    can_resume: true,
    resume_epoch: 3,
    ...(status === "failed"
      ? { error_message: "CUDA out of memory.", error_category: "out_of_memory" }
      : {}),
    ...overrides,
  });
}

describe("RunPage resume training", () => {
  it.each(["interrupted", "cancelled"] as const)(
    "shows a filled Resume training button for a %s run",
    async (status) => {
      stubTrainingApi({ run: resumable(status) });
      renderWithProviders(<AppRoutes />, { route: RUN_PATH });

      const button = await screen.findByRole("button", { name: "Resume training" });
      expect(button).toBeEnabled();
      expect(button).toHaveAttribute("data-variant", "filled");
    },
  );

  it("shows Resume training with the default variant for a failed run", async () => {
    stubTrainingApi({ run: resumable("failed") });
    renderWithProviders(<AppRoutes />, { route: RUN_PATH });

    const button = await screen.findByRole("button", { name: "Resume training" });
    expect(button).toBeEnabled();
    expect(button).toHaveAttribute("data-variant", "default");
  });

  it("disables the button, but keeps it, when the run cannot be resumed", async () => {
    stubTrainingApi({ run: resumable("cancelled", { can_resume: false }) });
    renderWithProviders(<AppRoutes />, { route: RUN_PATH });

    expect(await screen.findByRole("button", { name: "Resume training" })).toBeDisabled();
  });

  it("offers no Resume training for preparing, queued, running or completed runs", async () => {
    for (const status of ["preparing", "queued", "running", "completed"] as const) {
      stubTrainingApi({
        run: makeRun({ id: 7, name: "run-7", status, queue_position: null, can_resume: false }),
      });
      const view = renderWithProviders(<AppRoutes />, { route: RUN_PATH });
      await screen.findByText("Settings used");
      expect(screen.queryByRole("button", { name: "Resume training" })).toBeNull();
      view.unmount();
    }
  });

  it("queues the run, shows a loader while it waits and a green notification afterwards", async () => {
    let release: () => void = () => undefined;
    const resumeGate = new Promise<void>((resolve) => {
      release = resolve;
    });
    const stub = stubTrainingApi({
      run: resumable("cancelled"),
      resumeGate,
      resumeResult: makeRun({
        id: 7,
        name: "run-7",
        status: "queued",
        queue_position: 1,
        epoch: 3,
        epochs: 10,
        resume_count: 1,
        resume_epoch: 3,
        started_at: STARTED_AT,
      }),
    });
    const view = renderWithProviders(<AppRoutes />, { route: RUN_PATH });

    const button = await screen.findByRole("button", { name: "Resume training" });
    await view.user.click(button);

    expect(stub.resumes).toEqual(["/api/projects/1/runs/7/resume"]);
    await waitFor(() => expect(button).toHaveAttribute("data-loading", "true"));
    // a second click while the request is in flight sends nothing more
    await view.user.click(button);
    expect(stub.resumes).toHaveLength(1);
    expect(notifications.show).not.toHaveBeenCalled();

    release();

    expect(await screen.findByText("In queue: position 1")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Resume training" })).toBeNull();
    expect(notifications.show).toHaveBeenCalledTimes(1);
    expect(notifications.show).toHaveBeenCalledWith(
      expect.objectContaining({
        color: "green",
        message: 'Run "run-7" was queued to resume.',
      }),
    );
  });

  it("shows a red notification with the API message on a rejection and leaves the page unchanged", async () => {
    const stub = stubTrainingApi({
      run: resumable("interrupted"),
      resumeStatus: 422,
      resumeDetail: "No GPU is available.",
    });
    const view = renderWithProviders(<AppRoutes />, { route: RUN_PATH });

    await view.user.click(await screen.findByRole("button", { name: "Resume training" }));

    await waitFor(() =>
      expect(notifications.show).toHaveBeenCalledWith(
        expect.objectContaining({
          color: "red",
          title: "Error",
          message: "No GPU is available.",
        }),
      ),
    );
    expect(stub.resumes).toHaveLength(1);
    expect(screen.getByText("Run interrupted")).toBeInTheDocument();
    // the button is usable again for another try
    await waitFor(() =>
      expect(screen.getByRole("button", { name: "Resume training" })).not.toHaveAttribute(
        "data-loading",
      ),
    );
    expect(screen.getByRole("button", { name: "Resume training" })).toBeEnabled();
    expect(notifications.show).toHaveBeenCalledTimes(1);
  });

  it("does not wrap the header actions: the run name shrinks, the Russian label keeps its width", async () => {
    stubTrainingApi({ run: resumable("cancelled", { name: "a-very-long-run-name".repeat(6) }) });
    renderWithProviders(<AppRoutes />, { route: RUN_PATH, language: "ru" });

    const button = await screen.findByRole("button", { name: "Возобновить обучение" });
    expect(button).toHaveStyle({ flexShrink: "0" });
    const header = button.parentElement as HTMLElement;
    expect(header).toHaveStyle({ flexWrap: "nowrap" });
    expect(screen.getByRole("heading", { level: 2 })).toHaveStyle({ textOverflow: "ellipsis" });
  });

  it("reopens the event stream from the start once the run is resumed", async () => {
    let current = resumable("cancelled");
    stubTrainingApi({
      run: () => current,
      resumeResult: makeRun({
        id: 7,
        name: "run-7",
        status: "queued",
        queue_position: 1,
        epoch: 3,
        epochs: 10,
        resume_count: 1,
        resume_epoch: 3,
        started_at: STARTED_AT,
      }),
    });
    const view = renderWithProviders(<AppRoutes />, { route: RUN_PATH });
    await waitFor(() => expect(FakeEventSource.instances).toHaveLength(1));
    await act(async () => {
      latestEventSource().open();
      latestEventSource().emit("end", { status: "cancelled" });
    });
    current = makeRun({
      id: 7,
      name: "run-7",
      status: "queued",
      queue_position: 1,
      resume_count: 1,
      resume_epoch: 3,
      started_at: STARTED_AT,
    });

    await view.user.click(await screen.findByRole("button", { name: "Resume training" }));

    // the queued, resumed run keeps its charts: a second source replays the history
    await waitFor(() => expect(FakeEventSource.instances).toHaveLength(2));
    expect(FakeEventSource.instances[0].readyState).toBe(FakeEventSource.CLOSED);
    expect(latestEventSource().url).toBe("/api/projects/1/runs/7/stream");
  });

  it("opens no stream for a queued run that was never resumed", async () => {
    stubTrainingApi({ run: queued() });
    renderWithProviders(<AppRoutes />, { route: RUN_PATH });

    await screen.findByText("In queue: position 2");
    expect(FakeEventSource.instances).toHaveLength(0);
  });
});
