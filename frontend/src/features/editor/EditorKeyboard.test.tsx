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
