import { act, screen, waitFor } from "@testing-library/react";
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
import { stubEditorApi } from "../../test/editorApi";
import { renderWithProviders } from "../../test/render";
import { resetEditorUi } from "./store/editorUiStore";
import { resetEditors } from "./store/storeRegistry";

const ROUTE = "/projects/1/annotate/5";
const HINT = "Not saved — retrying…";

async function openEditor(options: Parameters<typeof stubEditorApi>[0] = {}) {
  stubImageDecoding(300, 200);
  stubElementSize(800, 600);
  installPointerCaptureStubs();
  const api = stubEditorApi(options);
  const rendered = renderWithProviders(<AppRoutes />, { route: ROUTE });
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
