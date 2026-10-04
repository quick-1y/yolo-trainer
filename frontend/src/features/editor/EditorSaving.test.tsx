import { act, screen, waitFor, within } from "@testing-library/react";
import { VirtuosoMockContext } from "react-virtuoso";
import { useLocation } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@mantine/notifications", () => ({
  notifications: { show: vi.fn() },
}));

import { notifications } from "@mantine/notifications";

import { AppRoutes } from "../../app/routes";
import {
  firePointer,
  getStage,
  installPointerCaptureStubs,
  stubElementSize,
  stubImageDecoding,
} from "../../test/canvas";
import { CAR_CLASS, type NeighborsFixture, stubEditorApi } from "../../test/editorApi";
import { renderWithProviders } from "../../test/render";
import { resetEditorUi } from "./store/editorUiStore";
import { anyUnsaved, resetEditors } from "./store/storeRegistry";

const ROUTE = "/projects/1/annotate/5";
const NEXT_ROUTE = "/projects/1/annotate/6";
const HINT = "Not saved — retrying…";
const CONFLICT_TEXT = "This image was changed elsewhere. Reload to continue.";
const MIDDLE: NeighborsFixture = { position: 2, total: 3, prev_id: 4, next_id: 6 };
const TRUCK_CLASS = {
  id: 8,
  name: "truck",
  color: "#3CB44B",
  index: 1,
  created_at: "2026-01-15T10:00:00Z",
};
const SERVER_BOX = {
  id: "9a1f0c2e-7b3d-4c5a-8e6f-0d1c2b3a4f5e",
  class_id: 7,
  x: 0.1,
  y: 0.1,
  w: 0.4,
  h: 0.4,
};

function LocationProbe() {
  const location = useLocation();
  return <div data-testid="location">{`${location.pathname}${location.search}`}</div>;
}

const currentLocation = () => screen.getByTestId("location").textContent ?? "";

async function openEditor(options: Parameters<typeof stubEditorApi>[0] = {}) {
  stubImageDecoding(300, 200);
  stubElementSize(800, 600);
  installPointerCaptureStubs();
  const api = stubEditorApi(options);
  // jsdom has no layout: the mock context makes the virtualized object list render its rows.
  const rendered = renderWithProviders(
    <VirtuosoMockContext.Provider value={{ viewportHeight: 400, itemHeight: 40 }}>
      <AppRoutes />
      <LocationProbe />
    </VirtuosoMockContext.Provider>,
    { route: ROUTE },
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

function press(init: KeyboardEventInit): KeyboardEvent {
  const event = new KeyboardEvent("keydown", { bubbles: true, cancelable: true, ...init });
  act(() => {
    document.body.dispatchEvent(event);
  });
  return event;
}

const saveStatus = () => screen.getByRole("status");
const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

beforeEach(() => {
  vi.mocked(notifications.show).mockClear();
});

afterEach(() => {
  vi.useRealTimers();
  resetEditors();
  resetEditorUi();
});

describe("a failing save (D-11)", () => {
  it("shows Not saved with the full hint, no notification, and returns to Saved after the retry", async () => {
    // Time runs normally, and the test can jump over the backoff wait.
    vi.useFakeTimers({ shouldAdvanceTime: true });
    const { puts } = await openEditor({ putQueue: ["unavailable"] });

    drag([100, 100], [400, 300]);

    await waitFor(() => expect(saveStatus()).toHaveTextContent("Not saved"));
    expect(saveStatus()).toHaveAttribute("aria-label", HINT);
    expect(saveStatus()).toHaveAttribute("aria-live", "polite");
    expect(puts).toHaveLength(1);
    expect(notifications.show).not.toHaveBeenCalled();

    await act(async () => {
      await vi.advanceTimersByTimeAsync(1300);
    });

    await waitFor(() => expect(saveStatus()).toHaveTextContent("Saved"));
    expect(puts).toHaveLength(2);
    // The retry carried the very same doc and base version.
    expect(puts[1]).toEqual(puts[0]);
    expect(saveStatus()).not.toHaveAttribute("aria-label");
    expect(saveStatus()).toHaveAttribute("aria-live", "off");
    expect(notifications.show).not.toHaveBeenCalled();
  });

  it("keeps retrying a network failure without a toast", async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    const { puts } = await openEditor({ putQueue: ["error", "error"] });

    drag([100, 100], [400, 300]);
    await waitFor(() => expect(saveStatus()).toHaveTextContent("Not saved"));

    await act(async () => {
      await vi.advanceTimersByTimeAsync(1300);
    });
    await waitFor(() => expect(puts).toHaveLength(2));
    expect(saveStatus()).toHaveTextContent("Not saved");

    await act(async () => {
      await vi.advanceTimersByTimeAsync(2600);
    });
    await waitFor(() => expect(saveStatus()).toHaveTextContent("Saved"));
    expect(puts).toHaveLength(3);
    expect(notifications.show).not.toHaveBeenCalled();
  });
});

describe("Ctrl+S (D-09)", () => {
  it("sends the pending change before the debounce elapses and prevents the browser's save dialog", async () => {
    const { puts } = await openEditor();

    drag([100, 100], [400, 300]);
    const event = press({ ctrlKey: true, code: "KeyS", key: "s" });

    expect(event.defaultPrevented).toBe(true);
    // The 400 ms debounce would not have fired inside this window.
    await waitFor(() => expect(puts).toHaveLength(1), { timeout: 300 });
    await waitFor(() => expect(saveStatus()).toHaveTextContent("Saved"));
  });

  it("works on the Russian layout and sends nothing when nothing is pending", async () => {
    const { puts } = await openEditor();

    const event = press({ ctrlKey: true, code: "KeyS", key: "ы" });
    await sleep(100);

    expect(event.defaultPrevented).toBe(true);
    expect(puts).toHaveLength(0);
    expect(saveStatus()).toHaveTextContent("Saved");
  });

  it("has no Save button", async () => {
    await openEditor();

    expect(screen.queryByRole("button", { name: /^save$/i })).not.toBeInTheDocument();
  });
});

/** Open the editor against a PUT that answers 409 and draw a box, so the conflict banner shows. */
async function openConflicted() {
  const opened = await openEditor({
    putMode: "conflict",
    classes: [CAR_CLASS, TRUCK_CLASS],
    neighbors: MIDDLE,
  });
  await screen.findByText("2 of 3");
  drag([100, 100], [400, 300]);
  const banner = await screen.findByRole("alert");
  return { ...opened, banner };
}

const toolButton = (name: string) => screen.getByRole("button", { name });
const findBox = (id: string) => getStage().findOne(`#box-${id}`);

describe("a conflict (409, D-12)", () => {
  it("shows the red banner with Reload and makes the tools read-only", async () => {
    const { banner, puts } = await openConflicted();

    expect(banner).toHaveTextContent(CONFLICT_TEXT);
    expect(within(banner).getByRole("button", { name: "Reload" })).toBeInTheDocument();
    expect(toolButton("Box")).toBeDisabled();
    expect(toolButton("Undo")).toBeDisabled();
    expect(toolButton("Redo")).toBeDisabled();
    // The conflict stops sending: no retry follows.
    await sleep(1500);
    expect(puts).toHaveLength(1);
    expect(notifications.show).not.toHaveBeenCalled();
  });

  it("makes editing keys, the class panel and the object list inert", async () => {
    const { user, puts } = await openConflicted();
    await user.click(screen.getByTestId("object-row"));

    press({ code: "Delete", key: "Delete" });
    press({ code: "KeyR", key: "r" });
    press({ code: "KeyG", key: "g" });
    press({ code: "Digit2", key: "2" });
    await user.click(screen.getByRole("button", { name: /truck/ }));
    await user.click(screen.getByRole("button", { name: "Delete object 1" }));
    await sleep(600);

    expect(screen.getByText("Objects: 1")).toBeInTheDocument();
    const row = within(screen.getByTestId("object-row"));
    expect(row.getByLabelText("Class of object 1")).toHaveValue("car");
    expect(row.getByLabelText("Class of object 1")).toBeDisabled();
    expect(screen.getByRole("button", { name: "Delete object 1" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "Mark as reviewed" })).toHaveAttribute(
      "aria-pressed",
      "false",
    );
    expect(puts).toHaveLength(1);
  });

  it("keeps navigation working: leaving asks first and Leave anyway moves on", async () => {
    const { user } = await openConflicted();

    const next = screen.getByRole("button", { name: "Next image" });
    expect(next).toBeEnabled();
    await user.click(next);
    const dialog = await screen.findByRole("dialog", { name: "Changes could not be saved" });
    await user.click(within(dialog).getByRole("button", { name: "Leave anyway" }));

    await waitFor(() => expect(currentLocation()).toBe(NEXT_ROUTE));
  });

  it("Reload refetches the annotations, shows the server's boxes and drops the history", async () => {
    const { user, banner, puts, annotationGets, setServerSet, setPutMode } = await openConflicted();
    setServerSet({ version: 7, boxes: [SERVER_BOX] });
    setPutMode("ok");
    const before = annotationGets.length;

    await user.click(within(banner).getByRole("button", { name: "Reload" }));

    await waitFor(() => expect(screen.queryByRole("alert")).not.toBeInTheDocument());
    expect(annotationGets.length).toBeGreaterThan(before);
    await waitFor(() => expect(findBox(SERVER_BOX.id)).toBeTruthy());
    expect(screen.getByText("Objects: 1")).toBeInTheDocument();
    expect(toolButton("Undo")).toBeDisabled();
    expect(toolButton("Box")).toBeEnabled();
    expect(anyUnsaved()).toBe(false);

    // Editing works again, based on the server's version.
    drag([300, 250], [500, 400]);
    await waitFor(() => expect(puts).toHaveLength(2));
    expect((puts[1] as { base_version: number }).base_version).toBe(7);
    await waitFor(() => expect(saveStatus()).toHaveTextContent("Saved"));
  });
});

describe("a rejected save (422)", () => {
  it("shows the server's message, refetches classes and annotations and rebuilds from the server", async () => {
    const opened = await openEditor({ putQueue: ["rejected"] });
    opened.setServerSet({ version: 2, boxes: [SERVER_BOX] });
    const classesBefore = opened.classGets.length;
    const annotationsBefore = opened.annotationGets.length;

    drag([100, 100], [400, 300]);

    await waitFor(() =>
      expect(notifications.show).toHaveBeenCalledWith(
        expect.objectContaining({ color: "red", message: "Unknown class." }),
      ),
    );
    await waitFor(() => expect(opened.classGets.length).toBeGreaterThan(classesBefore));
    await waitFor(() => expect(opened.annotationGets.length).toBeGreaterThan(annotationsBefore));
    await waitFor(() => expect(findBox(SERVER_BOX.id)).toBeTruthy());
    expect(screen.getByText("Objects: 1")).toBeInTheDocument();
    await waitFor(() => expect(saveStatus()).toHaveTextContent("Saved"));
    // The rejected doc is not sent again.
    await sleep(600);
    expect(opened.puts).toHaveLength(1);
    expect(notifications.show).toHaveBeenCalledTimes(1);
  });
});

describe("a save for a deleted image (404)", () => {
  it("shows the not-found view and stops guarding the tab", async () => {
    await openEditor({ putQueue: ["gone"] });

    drag([100, 100], [400, 300]);

    expect(await screen.findByText("Image not found")).toBeInTheDocument();
    await waitFor(() => expect(anyUnsaved()).toBe(false));
    expect(notifications.show).not.toHaveBeenCalled();
  });
});
