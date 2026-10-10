import { act, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { AppRoutes } from "../../app/routes";
import { renderWithProviders } from "../../test/render";
import { stubTrainingApi } from "../../test/trainingApi";

const ACTIVE_REQUEST = "GET /api/training/active";
const TRAINING = "/projects/1/training";

const ACTIVE = {
  run_id: 3,
  project_id: 1,
  project_name: "Plates",
  run_name: "run-3",
  epoch: 12,
  epochs: 100,
  started_at: "2026-01-15T10:05:00Z",
};

afterEach(() => {
  vi.useRealTimers();
});

describe("ActiveRunIndicator in the app header", () => {
  it("shows the project, the run and the epoch as a link to the run page", async () => {
    stubTrainingApi({ runs: [], activeRun: ACTIVE });
    renderWithProviders(<AppRoutes />, { route: TRAINING, pollActiveRun: true });

    const link = await screen.findByRole("link", { name: "Training: Plates / run-3, epoch 12/100" });

    expect(link).toHaveAttribute("href", "/projects/1/training/3");
    expect(link).toHaveAttribute("title", "Training: Plates / run-3, epoch 12/100");
  });

  it("says starting before the first epoch", async () => {
    stubTrainingApi({ runs: [], activeRun: { ...ACTIVE, epoch: null, epochs: null } });
    renderWithProviders(<AppRoutes />, { route: TRAINING, pollActiveRun: true });

    expect(
      await screen.findByRole("link", { name: "Training: Plates / run-3, starting" }),
    ).toBeInTheDocument();
  });

  it("is worded in Russian", async () => {
    stubTrainingApi({ runs: [], activeRun: ACTIVE });
    renderWithProviders(<AppRoutes />, { route: TRAINING, pollActiveRun: true, language: "ru" });

    expect(
      await screen.findByRole("link", { name: "Обучение: Plates / run-3, эпоха 12/100" }),
    ).toBeInTheDocument();
  });

  it("renders nothing when no run is training", async () => {
    const stub = stubTrainingApi({ runs: [], activeRun: null });
    renderWithProviders(<AppRoutes />, { route: TRAINING, pollActiveRun: true });

    await waitFor(() => expect(stub.count(ACTIVE_REQUEST)).toBeGreaterThanOrEqual(1));
    await screen.findByText("No training runs yet");
    expect(screen.queryByRole("link", { name: /^Training: / })).not.toBeInTheDocument();
  });

  it("hides silently when the poll fails", async () => {
    const stub = stubTrainingApi({ runs: [], activeRun: ACTIVE, activeStatus: 500 });
    renderWithProviders(<AppRoutes />, { route: TRAINING, pollActiveRun: true });

    await waitFor(() => expect(stub.count(ACTIVE_REQUEST)).toBeGreaterThanOrEqual(1));
    await screen.findByText("No training runs yet");
    expect(screen.queryByRole("link", { name: /^Training: / })).not.toBeInTheDocument();
  });

  it("asks again every 3 seconds through one shared query", async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    const stub = stubTrainingApi({ runs: [], activeRun: ACTIVE });
    renderWithProviders(<AppRoutes />, { route: TRAINING, pollActiveRun: true });

    await screen.findByRole("link", { name: /^Training: Plates/ });
    expect(stub.count(ACTIVE_REQUEST)).toBe(1);
    await act(async () => {
      await vi.advanceTimersByTimeAsync(3100);
    });

    await waitFor(() => expect(stub.count(ACTIVE_REQUEST)).toBe(2));
  });

  it("sends no request for the active run unless the test asks for the poller", async () => {
    const stub = stubTrainingApi({ runs: [], activeRun: ACTIVE });
    renderWithProviders(<AppRoutes />, { route: TRAINING });

    await screen.findByText("No training runs yet");

    expect(stub.count(ACTIVE_REQUEST)).toBe(0);
    expect(screen.queryByRole("link", { name: /^Training: / })).not.toBeInTheDocument();
  });
});

describe("Training link in the project sidebar", () => {
  it("shows a loader while a run of this project is training", async () => {
    stubTrainingApi({ runs: [], activeRun: ACTIVE });
    renderWithProviders(<AppRoutes />, { route: TRAINING, pollActiveRun: true });

    expect(await screen.findByLabelText("Training in progress")).toBeInTheDocument();
  });

  it("shows no loader while another project is training", async () => {
    const stub = stubTrainingApi({
      runs: [],
      activeRun: { ...ACTIVE, project_id: 2, project_name: "Cars" },
    });
    renderWithProviders(<AppRoutes />, { route: TRAINING, pollActiveRun: true });

    await screen.findByRole("link", { name: "Training: Cars / run-3, epoch 12/100" });

    expect(stub.count(ACTIVE_REQUEST)).toBeGreaterThanOrEqual(1);
    expect(screen.queryByLabelText("Training in progress")).not.toBeInTheDocument();
  });
});
