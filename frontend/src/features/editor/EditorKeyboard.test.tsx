import { act, screen, waitFor, within } from "@testing-library/react";
import type Konva from "konva";
import { afterEach, describe, expect, it } from "vitest";

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
import { resetEditorUi, useEditorUi } from "./store/editorUiStore";
import { peekEditor, resetEditors } from "./store/storeRegistry";

const BOX_ID = "3f2b8c1e-5d4a-4e7b-9c6d-1a2b3c4d5e6f";
const BOX = { id: BOX_ID, class_id: 7, x: 0.1, y: 0.2, w: 0.5, h: 0.5 };

type SavedBox = { id: string; x: number; y: number; w: number; h: number };

function setUpCanvas(): void {
  stubImageDecoding(300, 200);
  stubElementSize(800, 600);
  installPointerCaptureStubs();
}

async function openEditor() {
  const rendered = renderWithProviders(<AppRoutes />, { route: "/projects/1/annotate/5" });
  await screen.findByRole("application");
  await waitFor(() => expect(getStage().findOne("Image")).toBeTruthy());
  return rendered;
}

function boxNode(id = BOX_ID): Konva.Rect {
  const node = getStage().findOne(`#box-${id}`);
  if (!node) {
    throw new Error(`No box node for ${id}`);
  }
  return node as Konva.Rect;
}

function savedBoxes(put: Record<string, unknown>): SavedBox[] {
  return (put as { boxes: SavedBox[] }).boxes;
}

function drag(from: [number, number], to: [number, number]): void {
  const content = getStage().content;
  firePointer(content, "pointerdown", { clientX: from[0], clientY: from[1] });
  firePointer(content, "pointermove", { clientX: to[0], clientY: to[1] });
  firePointer(content, "pointerup", { clientX: to[0], clientY: to[1] });
}

function toolbar(): HTMLElement {
  return screen.getByRole("toolbar");
}

function undoButton(): HTMLElement {
  return within(toolbar()).getByRole("button", { name: "Undo" });
}

function redoButton(): HTMLElement {
  return within(toolbar()).getByRole("button", { name: "Redo" });
}

afterEach(() => {
  resetEditors();
  resetEditorUi();
});

describe("undo and redo buttons", () => {
  it("disables Undo and Redo on open", async () => {
    setUpCanvas();
    stubEditorApi();
    await openEditor();

    expect(undoButton()).toBeDisabled();
    expect(redoButton()).toBeDisabled();
  });

  it("undoes a drawn box with a save, then redoes it with another", async () => {
    setUpCanvas();
    const { puts } = stubEditorApi();
    const { user } = await openEditor();

    drag([100, 100], [400, 300]);
    await waitFor(() => expect(puts).toHaveLength(1));
    expect(savedBoxes(puts[0])).toHaveLength(1);
    await waitFor(() => expect(undoButton()).toBeEnabled());
    expect(redoButton()).toBeDisabled();

    await user.click(undoButton());

    await waitFor(() => expect(puts).toHaveLength(2));
    expect(savedBoxes(puts[1])).toEqual([]);
    expect(undoButton()).toBeDisabled();
    await waitFor(() => expect(redoButton()).toBeEnabled());

    await user.click(redoButton());

    await waitFor(() => expect(puts).toHaveLength(3));
    expect(savedBoxes(puts[2])).toHaveLength(1);
    expect(savedBoxes(puts[2])[0].id).toBe(savedBoxes(puts[0])[0].id);
    expect(redoButton()).toBeDisabled();
  });

  it("undoes a delete from the store with a save that brings the box back", async () => {
    setUpCanvas();
    const { puts } = stubEditorApi({ boxes: [BOX] });
    const { user } = await openEditor();
    const entry = peekEditor({ projectId: 1, imageId: 5 });
    if (!entry) {
      throw new Error("No editor entry");
    }

    act(() => {
      entry.store.getState().deleteBox(BOX_ID);
    });
    await waitFor(() => expect(puts).toHaveLength(1));
    expect(savedBoxes(puts[0])).toEqual([]);

    await user.click(undoButton());

    await waitFor(() => expect(puts).toHaveLength(2));
    expect(savedBoxes(puts[1])).toHaveLength(1);
    expect(savedBoxes(puts[1])[0].id).toBe(BOX_ID);
  });

  it("clears the selection when an undo removes the selected box", async () => {
    setUpCanvas();
    stubEditorApi();
    const { user } = await openEditor();
    drag([100, 100], [400, 300]);
    await waitFor(() => expect(undoButton()).toBeEnabled());
    await user.click(screen.getByRole("button", { name: "Select" }));
    const entry = peekEditor({ projectId: 1, imageId: 5 });
    const id = entry?.store.getState().doc.boxes[0]?.id;
    if (id === undefined) {
      throw new Error("No box was drawn");
    }
    act(() => {
      boxNode(id).fire("click", {});
    });
    await waitFor(() => expect(useEditorUi.getState().selectedId).toBe(id));

    await user.click(undoButton());

    await waitFor(() => expect(useEditorUi.getState().selectedId).toBeNull());
    expect((getStage().findOne("Transformer") as Konva.Transformer).nodes()).toHaveLength(0);
  });
});

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

function transformer(): Konva.Transformer {
  return getStage().findOne("Transformer") as Konva.Transformer;
}

function press(init: KeyboardEventInit): KeyboardEvent {
  const event = new KeyboardEvent("keydown", { bubbles: true, cancelable: true, ...init });
  act(() => {
    document.body.dispatchEvent(event);
  });
  return event;
}

function toolButton(name: "Select" | "Box"): HTMLElement {
  return within(toolbar()).getByRole("button", { name });
}

async function openWithSelectedBox() {
  const api = stubEditorApi({ boxes: [BOX] });
  const { user } = await openEditor();
  await user.click(toolButton("Select"));
  act(() => {
    boxNode().fire("click", {});
  });
  await waitFor(() => expect(transformer().nodes()).toHaveLength(1));
  return { ...api, user };
}

describe("keyboard shortcuts", () => {
  it("deletes the selected box on Delete with one save, and Ctrl+Z brings it back with one more", async () => {
    setUpCanvas();
    const { puts } = await openWithSelectedBox();

    press({ code: "Delete", key: "Delete" });

    await waitFor(() => expect(puts).toHaveLength(1));
    expect(savedBoxes(puts[0])).toEqual([]);
    expect(useEditorUi.getState().selectedId).toBeNull();
    expect(getStage().findOne(`#box-${BOX_ID}`)).toBeUndefined();

    press({ code: "KeyZ", key: "z", ctrlKey: true });

    await waitFor(() => expect(puts).toHaveLength(2));
    expect(savedBoxes(puts[1])).toHaveLength(1);
    expect(savedBoxes(puts[1])[0].id).toBe(BOX_ID);
    await sleep(700);
    expect(puts).toHaveLength(2);
  });

  it("deletes on Backspace and prevents the browser's back navigation", async () => {
    setUpCanvas();
    const { puts } = await openWithSelectedBox();

    const event = press({ code: "Backspace", key: "Backspace" });

    expect(event.defaultPrevented).toBe(true);
    await waitFor(() => expect(puts).toHaveLength(1));
    expect(savedBoxes(puts[0])).toEqual([]);
  });

  it("redoes with Ctrl+Shift+Z and with Ctrl+Y", async () => {
    setUpCanvas();
    const { puts } = await openWithSelectedBox();
    press({ code: "Delete", key: "Delete" });
    await waitFor(() => expect(puts).toHaveLength(1));
    press({ code: "KeyZ", key: "z", ctrlKey: true });
    await waitFor(() => expect(puts).toHaveLength(2));

    press({ code: "KeyZ", key: "Z", ctrlKey: true, shiftKey: true });
    await waitFor(() => expect(puts).toHaveLength(3));
    expect(savedBoxes(puts[2])).toEqual([]);

    press({ code: "KeyZ", key: "z", ctrlKey: true });
    await waitFor(() => expect(puts).toHaveLength(4));
    press({ code: "KeyY", key: "y", ctrlKey: true });
    await waitFor(() => expect(puts).toHaveLength(5));
    expect(savedBoxes(puts[4])).toEqual([]);
  });

  it("does nothing for a held Delete", async () => {
    setUpCanvas();
    const { puts } = await openWithSelectedBox();

    press({ code: "Delete", key: "Delete", repeat: true });
    await sleep(700);

    expect(puts).toHaveLength(0);
    expect(useEditorUi.getState().selectedId).toBe(BOX_ID);
  });

  it("does nothing on Delete when no box is selected", async () => {
    setUpCanvas();
    const { puts } = stubEditorApi({ boxes: [BOX] });
    await openEditor();

    press({ code: "Delete", key: "Delete" });
    await sleep(700);

    expect(puts).toHaveLength(0);
  });

  it("switches tools with V and B, also on the Russian layout", async () => {
    setUpCanvas();
    stubEditorApi();
    await openEditor();
    expect(toolButton("Box")).toHaveAttribute("aria-pressed", "true");

    press({ code: "KeyV", key: "м" });
    await waitFor(() => expect(toolButton("Select")).toHaveAttribute("aria-pressed", "true"));
    expect(toolButton("Box")).toHaveAttribute("aria-pressed", "false");

    press({ code: "KeyB", key: "и" });
    await waitFor(() => expect(toolButton("Box")).toHaveAttribute("aria-pressed", "true"));
  });

  it("does not switch to the Box tool when the project has no classes", async () => {
    setUpCanvas();
    stubEditorApi({ classes: [] });
    await openEditor();
    press({ code: "KeyV", key: "v" });
    await waitFor(() => expect(toolButton("Select")).toHaveAttribute("aria-pressed", "true"));

    press({ code: "KeyB", key: "b" });
    await sleep(50);

    expect(toolButton("Select")).toHaveAttribute("aria-pressed", "true");
    expect(toolButton("Box")).toHaveAttribute("aria-pressed", "false");
  });

  it("cancels a draft on Escape: nothing is created or saved", async () => {
    setUpCanvas();
    const { puts } = stubEditorApi();
    await openEditor();
    const content = getStage().content;

    firePointer(content, "pointerdown", { clientX: 100, clientY: 100 });
    firePointer(content, "pointermove", { clientX: 400, clientY: 300 });
    const draft = getStage().find("Rect").find((node) => node.attrs.dash !== undefined);
    expect(draft?.visible()).toBe(true);

    press({ code: "Escape", key: "Escape" });

    expect(draft?.visible()).toBe(false);
    firePointer(content, "pointerup", { clientX: 400, clientY: 300 });
    await sleep(700);
    expect(puts).toHaveLength(0);
    expect(peekEditor({ projectId: 1, imageId: 5 })?.store.getState().doc.boxes).toEqual([]);
  });

  it("a later draft still works after an Escape cancel", async () => {
    setUpCanvas();
    const { puts } = stubEditorApi();
    await openEditor();
    const content = getStage().content;
    firePointer(content, "pointerdown", { clientX: 100, clientY: 100 });
    press({ code: "Escape", key: "Escape" });
    firePointer(content, "pointerup", { clientX: 200, clientY: 200 });

    drag([100, 100], [400, 300]);

    await waitFor(() => expect(puts).toHaveLength(1));
    expect(savedBoxes(puts[0])).toHaveLength(1);
  });

  it("deselects on Escape when no draft is active", async () => {
    setUpCanvas();
    await openWithSelectedBox();

    press({ code: "Escape", key: "Escape" });

    await waitFor(() => expect(transformer().nodes()).toHaveLength(0));
    expect(useEditorUi.getState().selectedId).toBeNull();
  });

  it("puts the key caps of the shortcuts in the tool bar tooltips", async () => {
    setUpCanvas();
    stubEditorApi({ boxes: [BOX] });
    const { user } = await openEditor();
    press({ code: "KeyZ", key: "z", ctrlKey: true });

    await user.hover(toolButton("Select").parentElement as HTMLElement);

    const tip = await screen.findByRole("tooltip");
    expect(within(tip).getByText("Select")).toBeInTheDocument();
    expect(within(tip).getByText("V")).toBeInTheDocument();
  });
});
