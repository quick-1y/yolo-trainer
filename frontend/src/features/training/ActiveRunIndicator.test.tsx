import { act, fireEvent, screen, waitFor, within } from "@testing-library/react";
import { useLocation } from "react-router-dom";
import { afterEach, describe, expect, it, vi } from "vitest";

import { AppRoutes } from "../../app/routes";
import {
  firePointer,
  getStage,
  installPointerCaptureStubs,
  stubElementSize,
  stubImageDecoding,
} from "../../test/canvas";
import { type PutMode, stubEditorApi } from "../../test/editorApi";
import { renderWithProviders } from "../../test/render";
import { stubTrainingApi } from "../../test/trainingApi";
import { resetEditorUi } from "../editor/store/editorUiStore";
import { resetEditors } from "../editor/store/storeRegistry";

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

const realMatchMedia = window.matchMedia;

afterEach(() => {
  vi.useRealTimers();
  window.matchMedia = realMatchMedia;
  resetEditors();
  resetEditorUi();
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

const FULL_LABEL = "Training: Plates / run-3, epoch 12/100";
const EDITOR_ROUTE = "/projects/1/annotate/5";
const RUN_PATH = "/projects/1/training/3";
const LEAVE_TITLE = "Changes could not be saved";

function LocationProbe() {
  const location = useLocation();
  return <div data-testid="location">{`${location.pathname}${location.search}`}</div>;
}

const currentLocation = () => screen.getByTestId("location").textContent ?? "";

/** The viewport is at least 1440px wide (the top bar shows its wide layout) or narrower. */
function setWideViewport(wide: boolean): void {
  window.matchMedia = (query: string) => ({
    matches: wide && query.includes("(min-width: 1440px)"),
    media: query,
    onchange: null,
    addListener: () => undefined,
    removeListener: () => undefined,
    addEventListener: () => undefined,
    removeEventListener: () => undefined,
    dispatchEvent: () => false,
  });
}

async function openEditor({
  activeRun = ACTIVE,
  wide = false,
  putMode = "ok",
}: { activeRun?: unknown; wide?: boolean; putMode?: PutMode } = {}) {
  setWideViewport(wide);
  stubImageDecoding(300, 200);
  stubElementSize(800, 600);
  installPointerCaptureStubs();
  const api = stubEditorApi({ activeRun, putMode });
  const rendered = renderWithProviders(
    <>
      <AppRoutes />
      <LocationProbe />
    </>,
    { route: EDITOR_ROUTE, pollActiveRun: true },
  );
  await screen.findByRole("application");
  await waitFor(() => expect(getStage().findOne("Image")).toBeTruthy());
  return { ...rendered, ...api };
}

function drag(from: [number, number], to: [number, number]): void {
  const content = getStage().content;
  firePointer(content, "pointerdown", { clientX: from[0], clientY: from[1] });
  firePointer(content, "pointermove", { clientX: to[0], clientY: to[1] });
  firePointer(content, "pointerup", { clientX: to[0], clientY: to[1] });
}

describe("ActiveRunIndicator in the editor top bar", () => {
  it("shows a loader and 12/100 in a fixed 72 px pill at 1440 px and wider", async () => {
    await openEditor({ wide: true });

    const link = await screen.findByRole("link", { name: FULL_LABEL });

    expect(link).toHaveAttribute("href", RUN_PATH);
    expect(link).toHaveStyle({ width: "72px", height: "32px" });
    expect(link.querySelector(".mantine-Loader-root")).not.toBeNull();
    expect(within(link).getByText("12/100")).toBeInTheDocument();
    expect(link).not.toHaveTextContent("Plates");
  });

  it("is an icon-only 32 x 32 control below 1440 px", async () => {
    await openEditor({ wide: false });

    const link = await screen.findByRole("link", { name: FULL_LABEL });

    expect(link).toHaveStyle({ width: "32px", height: "32px" });
    expect(link.querySelector(".mantine-Loader-root")).not.toBeNull();
    expect(link).toHaveTextContent("");
  });

  it("shows the loader alone in the wide form before the first epoch", async () => {
    await openEditor({ wide: true, activeRun: { ...ACTIVE, epoch: null, epochs: null } });

    const link = await screen.findByRole("link", { name: "Training: Plates / run-3, starting" });

    expect(link).toHaveStyle({ width: "72px" });
    expect(link.querySelector(".mantine-Loader-root")).not.toBeNull();
    expect(link).toHaveTextContent("");
  });

  it("explains itself in a tooltip after the hover delay", async () => {
    const { user } = await openEditor({ wide: false });

    await user.hover(await screen.findByRole("link", { name: FULL_LABEL }));

    expect(await screen.findByRole("tooltip")).toHaveTextContent(FULL_LABEL);
  });

  it("adds nothing to the top bar when no run is training", async () => {
    const { fetchMock } = await openEditor({ activeRun: null });

    await waitFor(() =>
      expect(
        fetchMock.mock.calls.some(([input]) => String(input).endsWith("/api/training/active")),
      ).toBe(true),
    );
    expect(screen.queryByRole("link", { name: /^Training: / })).not.toBeInTheDocument();
  });

  it("saves a pending change first and then shows the run page on a plain click", async () => {
    const { puts, user } = await openEditor();
    drag([100, 100], [400, 300]);

    await user.click(await screen.findByRole("link", { name: FULL_LABEL }));

    await waitFor(() => expect(currentLocation()).toBe(RUN_PATH));
    expect(puts.length).toBeGreaterThanOrEqual(1);
  });

  it("opens the leave dialog and stays when the save fails", async () => {
    const { user } = await openEditor({ putMode: "error" });
    drag([100, 100], [400, 300]);
    await waitFor(() => expect(screen.getByRole("status")).toHaveTextContent("Not saved"));

    await user.click(screen.getByRole("link", { name: FULL_LABEL }));

    expect(await screen.findByRole("dialog", { name: LEAVE_TITLE })).toBeInTheDocument();
    expect(currentLocation()).toBe(EDITOR_ROUTE);
  });

  it.each([
    ["Ctrl", { ctrlKey: true }],
    ["Cmd", { metaKey: true }],
    ["Shift", { shiftKey: true }],
    ["middle", { button: 1 }],
  ])("leaves a %s click to the browser", async (_name, init) => {
    await openEditor();
    const link = await screen.findByRole("link", { name: FULL_LABEL });
    // Runs after React's own handler (it sits on the root, below document): it records whether
    // the indicator already cancelled the click, then cancels it so jsdom does not navigate.
    let cancelledByIndicator = true;
    const record = (event: Event) => {
      cancelledByIndicator = event.defaultPrevented;
      event.preventDefault();
    };
    document.addEventListener("click", record);

    fireEvent.click(link, init);
    document.removeEventListener("click", record);

    expect(cancelledByIndicator).toBe(false);
    expect(currentLocation()).toBe(EDITOR_ROUTE);
  });
});
