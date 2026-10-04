import { act, screen, waitFor, within } from "@testing-library/react";
import { useLocation } from "react-router-dom";
import { afterEach, describe, expect, it } from "vitest";

import { ApiError } from "../../api/client";
import { AppRoutes } from "../../app/routes";
import {
  firePointer,
  getStage,
  installPointerCaptureStubs,
  stubElementSize,
  stubImageDecoding,
} from "../../test/canvas";
import { type NeighborsFixture, type PutMode, stubEditorApi } from "../../test/editorApi";
import { renderWithProviders } from "../../test/render";
import { docFromSet } from "./store/annotationStore";
import { resetEditorUi } from "./store/editorUiStore";
import { anyUnsaved, getEditor, resetEditors } from "./store/storeRegistry";

const MIDDLE: NeighborsFixture = { position: 2, total: 3, prev_id: 4, next_id: 6 };
const ROUTE = "/projects/1/annotate/5?sort=name&q=img";
const NEXT_ROUTE = "/projects/1/annotate/6?sort=name&q=img";
const TITLE = "Changes could not be saved";
const BOX = { id: "3f2b8c1e-5d4a-4e7b-9c6d-1a2b3c4d5e6f", class_id: 7, x: 0, y: 0, w: 1, h: 1 };

function LocationProbe() {
  const location = useLocation();
  return <div data-testid="location">{`${location.pathname}${location.search}`}</div>;
}

function currentLocation(): string {
  return screen.getByTestId("location").textContent ?? "";
}

async function openEditor(putMode: PutMode = "ok") {
  stubImageDecoding(300, 200);
  stubElementSize(800, 600);
  installPointerCaptureStubs();
  const api = stubEditorApi({ neighbors: MIDDLE, putMode });
  const rendered = renderWithProviders(
    <>
      <AppRoutes />
      <LocationProbe />
    </>,
    { route: ROUTE },
  );
  await screen.findByRole("application");
  await waitFor(() => expect(getStage().findOne("Image")).toBeTruthy());
  await screen.findByText("2 of 3");
  return { ...rendered, ...api };
}

function drag(from: [number, number], to: [number, number]): void {
  const content = getStage().content;
  firePointer(content, "pointerdown", { clientX: from[0], clientY: from[1] });
  firePointer(content, "pointermove", { clientX: to[0], clientY: to[1] });
  firePointer(content, "pointerup", { clientX: to[0], clientY: to[1] });
}

function press(init: KeyboardEventInit): void {
  const event = new KeyboardEvent("keydown", { bubbles: true, cancelable: true, ...init });
  act(() => {
    document.body.dispatchEvent(event);
  });
}

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

/** True when the page's beforeunload handlers asked the browser to confirm closing. */
function beforeUnloadPrevented(): boolean {
  const event = new Event("beforeunload", { cancelable: true });
  window.dispatchEvent(event);
  return event.defaultPrevented;
}

const nextButton = () => screen.getByRole("button", { name: "Next image" });
const saveStatus = () => screen.getByRole("status");

/** Draw a box against a failing save and click › until the leave dialog is open. */
async function openLeaveDialog() {
  const opened = await openEditor("error");
  drag([100, 100], [400, 300]);
  await waitFor(() => expect(saveStatus()).toHaveTextContent("Not saved"));
  await opened.user.click(nextButton());
  const dialog = await screen.findByRole("dialog", { name: TITLE });
  return { ...opened, dialog };
}

afterEach(() => {
  resetEditors();
  resetEditorUi();
});

describe("leave dialog", () => {
  it("opens when the save fails, focuses Retry and turns the shortcuts off", async () => {
    const { dialog, puts } = await openLeaveDialog();

    const retry = within(dialog).getByRole("button", { name: "Retry" });
    await waitFor(() => expect(retry).toHaveFocus());
    expect(within(dialog).getByRole("button", { name: "Leave anyway" })).toBeInTheDocument();
    expect(within(dialog).getByText(/not saved yet/)).toBeInTheDocument();
    const sent = puts.length;

    press({ code: "KeyD", key: "d" });
    press({ code: "ArrowRight", key: "ArrowRight" });
    press({ code: "KeyV", key: "v" });
    await sleep(100);

    expect(currentLocation()).toBe(ROUTE);
    expect(puts).toHaveLength(sent);
    // No editor shortcut acts behind the dialog: the Box tool is still the active one.
    expect(screen.getByRole("button", { name: "Box", hidden: true })).toHaveAttribute(
      "aria-pressed",
      "true",
    );
  });

  it("Retry saves again and navigates once the save succeeds", async () => {
    const { dialog, puts, setPutMode, user } = await openLeaveDialog();
    const sent = puts.length;
    setPutMode("ok");

    await user.click(within(dialog).getByRole("button", { name: "Retry" }));

    await waitFor(() => expect(currentLocation()).toBe(NEXT_ROUTE));
    expect(puts).toHaveLength(sent + 1);
  });

  it("Retry keeps the dialog open while the save still fails", async () => {
    const { dialog, puts, user } = await openLeaveDialog();
    const sent = puts.length;

    await user.click(within(dialog).getByRole("button", { name: "Retry" }));

    await waitFor(() => expect(puts).toHaveLength(sent + 1));
    await sleep(100);
    expect(screen.getByRole("dialog", { name: TITLE })).toBeInTheDocument();
    expect(currentLocation()).toBe(ROUTE);
  });

  it("Leave anyway navigates at once without another save", async () => {
    const { dialog, puts, user } = await openLeaveDialog();
    const sent = puts.length;

    await user.click(within(dialog).getByRole("button", { name: "Leave anyway" }));

    await waitFor(() => expect(currentLocation()).toBe(NEXT_ROUTE));
    expect(puts).toHaveLength(sent);
  });

  it("Esc closes the dialog and keeps the user on the image", async () => {
    const { user } = await openLeaveDialog();

    await user.keyboard("{Escape}");

    await waitFor(() => expect(screen.queryByRole("dialog", { name: TITLE })).not.toBeInTheDocument());
    expect(currentLocation()).toBe(ROUTE);
    // The editor is usable again.
    press({ code: "KeyV", key: "v" });
    await waitFor(() =>
      expect(screen.getByRole("button", { name: "Select" })).toHaveAttribute("aria-pressed", "true"),
    );
  });

  it("opens for a conflict too", async () => {
    const { user } = await openEditor("conflict");
    drag([100, 100], [400, 300]);
    await waitFor(() => expect(saveStatus()).toHaveTextContent("Not saved"));

    await user.click(nextButton());

    expect(await screen.findByRole("dialog", { name: TITLE })).toBeInTheDocument();
    expect(currentLocation()).toBe(ROUTE);
  });

  it("opens from the Back button as well and leaves for the grid with Leave anyway", async () => {
    const { user } = await openEditor("error");
    drag([100, 100], [400, 300]);
    await waitFor(() => expect(saveStatus()).toHaveTextContent("Not saved"));

    await user.click(screen.getByRole("button", { name: "Back to images" }));
    const dialog = await screen.findByRole("dialog", { name: TITLE });
    await user.click(within(dialog).getByRole("button", { name: "Leave anyway" }));

    await waitFor(() => expect(currentLocation()).toBe("/projects/1/images?sort=name&q=img"));
  });
});

describe("beforeunload guard", () => {
  it("does not prompt when nothing is unsaved", async () => {
    await openEditor();

    expect(beforeUnloadPrevented()).toBe(false);
  });

  it("prompts while a change is being saved and stops once it is saved", async () => {
    const { setPutMode, releasePuts, puts } = await openEditor();
    setPutMode("hold");

    drag([100, 100], [400, 300]);
    expect(beforeUnloadPrevented()).toBe(true);
    await waitFor(() => expect(puts).toHaveLength(1));
    expect(beforeUnloadPrevented()).toBe(true);

    releasePuts();

    await waitFor(() => expect(saveStatus()).toHaveTextContent("Saved"));
    expect(beforeUnloadPrevented()).toBe(false);
  });

  it("prompts after a failed save", async () => {
    await openEditor("error");

    drag([100, 100], [400, 300]);
    await waitFor(() => expect(saveStatus()).toHaveTextContent("Not saved"));

    expect(beforeUnloadPrevented()).toBe(true);
  });

  it("prompts after a conflicting save", async () => {
    await openEditor("conflict");

    drag([100, 100], [400, 300]);
    await waitFor(() => expect(saveStatus()).toHaveTextContent("Not saved"));

    expect(beforeUnloadPrevented()).toBe(true);
  });

  it("still prompts after the editor route was left with the save pending", async () => {
    const { user } = await openEditor("error");
    drag([100, 100], [400, 300]);
    await waitFor(() => expect(saveStatus()).toHaveTextContent("Not saved"));
    await user.click(screen.getByRole("button", { name: "Back to images" }));
    const dialog = await screen.findByRole("dialog", { name: TITLE });
    await user.click(within(dialog).getByRole("button", { name: "Leave anyway" }));
    await waitFor(() => expect(currentLocation()).toBe("/projects/1/images?sort=name&q=img"));
    expect(screen.queryByRole("application")).not.toBeInTheDocument();

    expect(beforeUnloadPrevented()).toBe(true);
  });

  it("also sets returnValue so every browser shows its prompt", async () => {
    await openEditor("error");
    drag([100, 100], [400, 300]);
    await waitFor(() => expect(saveStatus()).toHaveTextContent("Not saved"));
    const event = new Event("beforeunload", { cancelable: true }) as BeforeUnloadEvent;
    Object.defineProperty(event, "returnValue", { configurable: true, writable: true, value: undefined });

    window.dispatchEvent(event);

    expect(event.returnValue).toBe("");
  });
});

describe("anyUnsaved", () => {
  const init = {
    doc: docFromSet({
      version: 0,
      is_background: false,
      is_reviewed: false,
      status: "unannotated",
      boxes: [],
    }),
    version: 0,
  };
  const ok = async (input: { base_version: number }) => ({
    version: input.base_version + 1,
    box_count: 1,
    status: "annotated" as const,
    is_background: false,
    is_reviewed: false,
  });

  it("is false for no editors and for a clean one", () => {
    expect(anyUnsaved()).toBe(false);
    getEditor({ projectId: 1, imageId: 5 }, init, ok);
    expect(anyUnsaved()).toBe(false);
  });

  it("is true for an entry with a pending change and false once it is flushed", async () => {
    const entry = getEditor({ projectId: 1, imageId: 5 }, init, ok);

    entry.store.getState().createBox(BOX);
    expect(anyUnsaved()).toBe(true);
    await entry.saver.flush();

    expect(anyUnsaved()).toBe(false);
  });

  it("is true for an entry whose save failed and for one in conflict", async () => {
    const failing = getEditor({ projectId: 1, imageId: 5 }, init, async () => {
      throw new ApiError("boom", 500);
    });
    failing.store.getState().createBox(BOX);
    expect(await failing.saver.flush()).toBe("error");
    expect(anyUnsaved()).toBe(true);
    resetEditors();

    const conflicting = getEditor({ projectId: 1, imageId: 6 }, init, async () => {
      throw new ApiError("conflict", 409);
    });
    conflicting.store.getState().createBox(BOX);
    expect(await conflicting.saver.flush()).toBe("conflict");
    expect(anyUnsaved()).toBe(true);
  });

  it("stops guarding after resetEditors", () => {
    const entry = getEditor({ projectId: 1, imageId: 5 }, init, ok);
    entry.store.getState().createBox(BOX);
    expect(beforeUnloadPrevented()).toBe(true);

    resetEditors();

    expect(beforeUnloadPrevented()).toBe(false);
  });
});
