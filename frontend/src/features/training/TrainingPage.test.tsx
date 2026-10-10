import { act, screen, waitFor, within } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { AppRoutes } from "../../app/routes";
import { renderWithProviders } from "../../test/render";
import { makeRun, stubTrainingApi } from "../../test/trainingApi";

const COMPLETED = makeRun({
  id: 3,
  name: "run-3",
  status: "completed",
  queue_position: null,
  epoch: 100,
  map50: 0.812,
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
    expect(within(completedRow).getByText("0.812")).toBeInTheDocument();
    expect(within(completedRow).getByText("Completed")).toBeInTheDocument();
    expect(within(completedRow).getByText("yolo26n")).toBeInTheDocument();
    const download = within(completedRow).getByRole("link", { name: /plates_run-3_best\.pt/ });
    expect(download).toHaveAttribute("href", "/api/models/9/download");
    expect(download).toHaveAttribute("download");

    expect(within(runningRow).getByText("Epoch 12 of 100")).toBeInTheDocument();
    expect(within(runningRow).getByText("—")).toBeInTheDocument();
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

    const name = await screen.findByTestId("run-name");
    expect(name).toHaveAttribute("title", longName);
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

    expect(await screen.findByText("0.812")).toBeInTheDocument();
    await act(async () => {
      await vi.advanceTimersByTimeAsync(7000);
    });
    expect(stub.count("GET /api/projects/1/runs")).toBe(1);
  });

  it("renders the column headers and badges in Russian", async () => {
    stubTrainingApi({ runs: [QUEUED] });
    renderWithProviders(<AppRoutes />, { route: TRAINING, language: "ru" });

    expect(await screen.findByText("Статус")).toBeInTheDocument();
    expect(screen.getByText("В очереди: 2")).toBeInTheDocument();
    expect(screen.getByText("Запусков: 1")).toBeInTheDocument();
  });
});
