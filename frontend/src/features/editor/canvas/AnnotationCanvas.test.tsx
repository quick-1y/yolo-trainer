import { act, screen, waitFor, within } from "@testing-library/react";
import type Konva from "konva";
import { afterEach, describe, expect, it } from "vitest";

import { AppRoutes } from "../../../app/routes";
import {
  firePointer,
  getStage,
  installPointerCaptureStubs,
  stubElementSize,
  stubImageDecoding,
} from "../../../test/canvas";
import { CAR_CLASS, stubEditorApi } from "../../../test/editorApi";
import { renderWithProviders } from "../../../test/render";
import { resetEditorUi } from "../store/editorUiStore";
import { peekEditor, resetEditors } from "../store/storeRegistry";

const BOX_ID = "3f2b8c1e-5d4a-4e7b-9c6d-1a2b3c4d5e6f";
const OTHER_ID = "9a8b7c6d-5e4f-4a3b-8c2d-1e0f9a8b7c6d";
const LONG_NAME = "an extremely long class name exceeding the limit";

const BOX = { id: BOX_ID, class_id: 7, x: 0.1, y: 0.2, w: 0.5, h: 0.5 };

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

function transformer(): Konva.Transformer {
  return getStage().findOne("Transformer") as Konva.Transformer;
}

function crosshairLines(): Konva.Line[] {
  return getStage().find(".crosshair-line") as Konva.Line[];
}

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

/** The registry entry of the opened image (project 1, image 5). */
function editor() {
  const entry = peekEditor({ projectId: 1, imageId: 5 });
  if (!entry) {
    throw new Error("No editor entry");
  }
  return entry;
}

function pastStates(): number {
  return editor().store.temporal.getState().pastStates.length;
}

function fire(node: Konva.Node, type: string): void {
  act(() => {
    node.fire(type, {});
  });
}

afterEach(() => {
  resetEditors();
  resetEditorUi();
});

describe("tool bar", () => {
  it("renders Select and Box as toggles with Box active on open", async () => {
    setUpCanvas();
    stubEditorApi();
    const { user } = await openEditor();

    const toolbar = screen.getByRole("toolbar");
    expect(toolbar).toHaveAttribute("aria-orientation", "vertical");
    const select = within(toolbar).getByRole("button", { name: "Select" });
    const box = within(toolbar).getByRole("button", { name: "Box" });
    expect(box).toHaveAttribute("aria-pressed", "true");
    expect(select).toHaveAttribute("aria-pressed", "false");

    await user.click(select);

    expect(select).toHaveAttribute("aria-pressed", "true");
    expect(box).toHaveAttribute("aria-pressed", "false");
  });

  it("disables Box when the project has no classes and explains why", async () => {
    setUpCanvas();
    stubEditorApi({ classes: [] });
    const { user } = await openEditor();

    const box = within(screen.getByRole("toolbar")).getByRole("button", { name: "Box" });
    expect(box).toBeDisabled();
    expect(within(screen.getByRole("toolbar")).getByRole("button", { name: "Select" })).toBeEnabled();

    await user.hover(box.parentElement as HTMLElement);
    // The canvas hint and the tooltip carry the same sentence.
    await waitFor(() =>
      expect(screen.getAllByText("Add a class to start drawing.").length).toBeGreaterThanOrEqual(2),
    );
  });

  it("disables Box while the original is still loading", async () => {
    // No stubImageDecoding: jsdom never decodes the image, so it stays loading.
    stubElementSize(800, 600);
    installPointerCaptureStubs();
    stubEditorApi();
    renderWithProviders(<AppRoutes />, { route: "/projects/1/annotate/5" });

    const toolbar = await screen.findByRole("toolbar");
    expect(within(toolbar).getByRole("button", { name: "Box" })).toBeDisabled();
    expect(within(toolbar).getByRole("button", { name: "Select" })).toBeEnabled();
  });
});

describe("selection", () => {
  it("selects a box on click in the Select tool, attaches a Transformer and deselects on empty canvas", async () => {
    setUpCanvas();
    stubEditorApi({ boxes: [BOX] });
    const { user } = await openEditor();
    await user.click(screen.getByRole("button", { name: "Select" }));

    expect(transformer().nodes()).toHaveLength(0);

    fire(boxNode(), "click");

    await waitFor(() => expect(transformer().nodes()).toEqual([boxNode()]));
    expect(getStage().find("Transformer")).toHaveLength(1);

    fire(getStage(), "click");

    await waitFor(() => expect(transformer().nodes()).toHaveLength(0));
  });

  it("configures the Transformer: 8 square anchors, no rotation, no flip", async () => {
    setUpCanvas();
    stubEditorApi({ boxes: [BOX] });
    const { user } = await openEditor();
    await user.click(screen.getByRole("button", { name: "Select" }));
    fire(boxNode(), "click");
    await waitFor(() => expect(transformer().nodes()).toHaveLength(1));

    const tr = transformer();
    expect(tr.rotateEnabled()).toBe(false);
    expect(tr.flipEnabled()).toBe(false);
    expect(tr.keepRatio()).toBe(false);
    expect(tr.enabledAnchors()).toHaveLength(8);
    expect(tr.anchorSize()).toBe(10);
    expect(tr.anchorFill()).toBe("#FFFFFF");
    expect(tr.anchorStroke()).toBe("#141414");
    expect(tr.anchorStrokeWidth()).toBe(1);
    expect(tr.borderStroke()).toBe("#FFFFFF");
    expect(tr.borderStrokeWidth()).toBe(1);
  });

  it("makes boxes inert in the Box tool and interactive in the Select tool", async () => {
    setUpCanvas();
    stubEditorApi({ boxes: [BOX] });
    const { user } = await openEditor();

    expect(boxNode().listening()).toBe(false);
    expect(boxNode().draggable()).toBe(false);

    await user.click(screen.getByRole("button", { name: "Select" }));

    await waitFor(() => expect(boxNode().listening()).toBe(true));
    expect(boxNode().draggable()).toBe(true);
  });

  it("drops the selection when switching to the Box tool", async () => {
    setUpCanvas();
    stubEditorApi({ boxes: [BOX] });
    const { user } = await openEditor();
    await user.click(screen.getByRole("button", { name: "Select" }));
    fire(boxNode(), "click");
    await waitFor(() => expect(transformer().nodes()).toHaveLength(1));

    await user.click(screen.getByRole("button", { name: "Box" }));

    await waitFor(() => expect(transformer().nodes()).toHaveLength(0));
  });
});

describe("crosshair guides", () => {
  it("shows two lines in the Box tool while the pointer is over the canvas and hides them on leave", async () => {
    setUpCanvas();
    stubEditorApi();
    await openEditor();

    expect(crosshairLines()).toHaveLength(2);
    expect(crosshairLines().every((line) => !line.visible())).toBe(true);

    firePointer(getStage().content, "pointermove", { clientX: 200, clientY: 150 });

    expect(crosshairLines().every((line) => line.visible())).toBe(true);

    act(() => {
      getStage().content.dispatchEvent(new MouseEvent("mouseleave"));
    });

    expect(crosshairLines().every((line) => !line.visible())).toBe(true);
  });

  it("spans the whole viewport and keeps a constant 1 screen px width", async () => {
    setUpCanvas();
    stubEditorApi();
    await openEditor();

    firePointer(getStage().content, "pointermove", { clientX: 200, clientY: 150 });

    const stage = getStage();
    const scale = stage.scaleX();
    const [vertical, horizontal] = crosshairLines();
    const [vx, vy1, vx2, vy2] = vertical.points();
    const [hx1, hy, hx2, hy2] = horizontal.points();
    expect(vx).toBe(vx2);
    expect(hy).toBe(hy2);
    // Viewport edges in image coordinates.
    expect(vy1).toBeCloseTo(-stage.y() / scale, 5);
    expect(vy2).toBeCloseTo((stage.height() - stage.y()) / scale, 5);
    expect(hx1).toBeCloseTo(-stage.x() / scale, 5);
    expect(hx2).toBeCloseTo((stage.width() - stage.x()) / scale, 5);
    expect(vertical.strokeScaleEnabled()).toBe(false);
    expect(vertical.strokeWidth()).toBe(1);
    expect(vertical.stroke()).toBe("rgba(255,255,255,0.7)");
  });

  it("stays hidden in the Select tool", async () => {
    setUpCanvas();
    stubEditorApi();
    const { user } = await openEditor();
    await user.click(screen.getByRole("button", { name: "Select" }));

    firePointer(getStage().content, "pointermove", { clientX: 200, clientY: 150 });

    expect(crosshairLines().every((line) => !line.visible())).toBe(true);
  });
});

describe("box label chips", () => {
  it("truncates a long class name to 24 characters ending in an ellipsis", async () => {
    setUpCanvas();
    stubEditorApi({
      classes: [{ ...CAR_CLASS, name: LONG_NAME, color: "#FFE119" }],
      boxes: [BOX],
    });
    await openEditor();

    const label = getStage().findOne(`#label-${BOX_ID}`) as Konva.Label;
    const text = label.getText().text();
    expect(text).toHaveLength(24);
    expect(text.endsWith("…")).toBe(true);
    expect(LONG_NAME.startsWith(text.slice(0, -1))).toBe(true);
  });

  it("keeps a name of up to 24 characters unchanged", async () => {
    setUpCanvas();
    stubEditorApi({ classes: [{ ...CAR_CLASS, name: "a".repeat(24) }], boxes: [BOX] });
    await openEditor();

    const label = getStage().findOne(`#label-${BOX_ID}`) as Konva.Label;
    expect(label.getText().text()).toBe("a".repeat(24));
  });

  it("uses black text on a light class color and white text on a dark one", async () => {
    setUpCanvas();
    stubEditorApi({
      classes: [
        { ...CAR_CLASS, id: 7, color: "#FFE119" },
        { ...CAR_CLASS, id: 8, name: "plane", color: "#000075", index: 1 },
      ],
      boxes: [BOX, { id: OTHER_ID, class_id: 8, x: 0.7, y: 0.7, w: 0.2, h: 0.2 }],
    });
    await openEditor();

    const light = getStage().findOne(`#label-${BOX_ID}`) as Konva.Label;
    const dark = getStage().findOne(`#label-${OTHER_ID}`) as Konva.Label;
    expect(light.getText().fill()).toBe("#000000");
    expect(light.getTag().fill()).toBe("#FFE119");
    expect(dark.getText().fill()).toBe("#FFFFFF");
    expect(dark.getTag().fill()).toBe("#000075");
  });

  it("keeps the chip 16 screen px high and above the box", async () => {
    setUpCanvas();
    stubEditorApi({ boxes: [BOX] });
    await openEditor();

    const label = getStage().findOne(`#label-${BOX_ID}`) as Konva.Label;
    const scale = getStage().scaleX();
    expect(label.getTag().height() * scale).toBeCloseTo(16, 3);
    expect(label.getText().fontSize() * scale).toBeCloseTo(12, 3);
    // The box starts at y = 0.2 * 200 = 40 px, so the chip fits above it.
    expect(label.y() + label.getTag().height()).toBeCloseTo(40, 3);
  });

  it("moves the chip inside the box when there is no room above it", async () => {
    setUpCanvas();
    stubEditorApi({ boxes: [{ ...BOX, y: 0 }] });
    await openEditor();

    const label = getStage().findOne(`#label-${BOX_ID}`) as Konva.Label;
    expect(label.y()).toBe(0);
  });
});

type SavedBox = { id: string; x: number; y: number; w: number; h: number };

function savedBoxes(put: Record<string, unknown>): SavedBox[] {
  return (put as { boxes: SavedBox[] }).boxes;
}

// 60 x 40 image px on the 300 x 200 test image.
const SMALL = { id: BOX_ID, class_id: 7, x: 0.1, y: 0.1, w: 0.2, h: 0.2 };

async function openSelected(options: Parameters<typeof stubEditorApi>[0]) {
  const api = stubEditorApi(options);
  const { user } = await openEditor();
  await user.click(screen.getByRole("button", { name: "Select" }));
  fire(boxNode(), "click");
  await waitFor(() => expect(transformer().nodes()).toHaveLength(1));
  return api;
}

describe("moving a box", () => {
  it("clamps the drag inside the image and saves once, on release", async () => {
    setUpCanvas();
    const { puts } = await openSelected({ boxes: [SMALL] });
    const node = boxNode();
    const before = pastStates();

    node.setAttrs({ x: 280, y: -5 });
    fire(node, "dragmove");

    expect(node.x()).toBe(240);
    expect(node.y()).toBe(0);
    // Nothing is written while the drag is in progress.
    expect(pastStates()).toBe(before);
    await sleep(700);
    expect(puts).toHaveLength(0);

    fire(node, "dragend");

    await waitFor(() => expect(puts).toHaveLength(1));
    const [box] = savedBoxes(puts[0]);
    expect(box.x).toBeCloseTo(0.8, 6);
    expect(box.y).toBe(0);
    expect(box.w).toBeCloseTo(0.2, 6);
    expect(box.h).toBeCloseTo(0.2, 6);
    expect(pastStates()).toBe(before + 1);
    await sleep(700);
    expect(puts).toHaveLength(1);
  });

  it("is undoable as one step", async () => {
    setUpCanvas();
    const { puts } = await openSelected({ boxes: [SMALL] });
    const node = boxNode();
    node.setAttrs({ x: 150, y: 100 });
    fire(node, "dragend");
    await waitFor(() => expect(puts).toHaveLength(1));

    act(() => {
      editor().store.temporal.getState().undo();
    });

    expect(editor().store.getState().doc.boxes[0]).toMatchObject({ x: 0.1, y: 0.1 });
    await waitFor(() => expect(puts).toHaveLength(2));
    expect(savedBoxes(puts[1])[0]).toMatchObject({ x: 0.1, y: 0.1 });
  });

  it("selects an unselected box when its drag starts", async () => {
    setUpCanvas();
    stubEditorApi({ boxes: [SMALL] });
    const { user } = await openEditor();
    await user.click(screen.getByRole("button", { name: "Select" }));

    fire(boxNode(), "dragstart");

    await waitFor(() => expect(transformer().nodes()).toEqual([boxNode()]));
  });

  it("clears is_reviewed of a reviewed image in the same save", async () => {
    setUpCanvas();
    const { puts } = await openSelected({ boxes: [SMALL], isReviewed: true });
    const node = boxNode();

    node.setAttrs({ x: 100, y: 100 });
    fire(node, "dragend");

    await waitFor(() => expect(puts).toHaveLength(1));
    expect((puts[0] as { is_reviewed: boolean }).is_reviewed).toBe(false);
    expect(pastStates()).toBe(1);
  });

  it("does not save a drag that ends where it started", async () => {
    setUpCanvas();
    const { puts } = await openSelected({ boxes: [SMALL] });

    fire(boxNode(), "dragend");
    await sleep(700);

    expect(puts).toHaveLength(0);
    expect(pastStates()).toBe(0);
  });
});

describe("resizing a box", () => {
  it("commits the scaled size on transformend, resets the scale and saves once", async () => {
    setUpCanvas();
    const { puts } = await openSelected({ boxes: [BOX] });
    const node = boxNode();
    const before = pastStates();

    node.scaleX(0.5);
    fire(node, "transformend");

    await waitFor(() => expect(puts).toHaveLength(1));
    expect(node.scaleX()).toBe(1);
    expect(node.scaleY()).toBe(1);
    const [box] = savedBoxes(puts[0]);
    expect(box.w).toBeCloseTo(0.25, 6);
    expect(box.h).toBeCloseTo(0.5, 6);
    expect(box.x).toBeCloseTo(0.1, 6);
    expect(pastStates()).toBe(before + 1);
    await waitFor(() => expect(node.width()).toBeCloseTo(75, 3));
    await sleep(700);
    expect(puts).toHaveLength(1);
  });

  it("clips a resize that grows past the image edge", async () => {
    setUpCanvas();
    const { puts } = await openSelected({ boxes: [BOX] });
    const node = boxNode();

    node.scaleX(4);
    node.scaleY(4);
    fire(node, "transformend");

    await waitFor(() => expect(puts).toHaveLength(1));
    const [box] = savedBoxes(puts[0]);
    expect(box.x + box.w).toBeLessThanOrEqual(1);
    expect(box.y + box.h).toBeLessThanOrEqual(1);
  });

  it("never produces a negative or empty size when dragged through the opposite edge", async () => {
    setUpCanvas();
    const { puts } = await openSelected({ boxes: [BOX] });
    const node = boxNode();

    node.scaleX(-0.5);
    node.scaleY(-0.001);
    fire(node, "transformend");

    await waitFor(() => expect(puts).toHaveLength(1));
    const [box] = savedBoxes(puts[0]);
    expect(box.w).toBeGreaterThan(0);
    expect(box.h).toBeGreaterThan(0);
    // At least one image pixel each way.
    expect(box.w * 300).toBeGreaterThanOrEqual(1 - 1e-3);
    expect(box.h * 200).toBeGreaterThanOrEqual(1 - 1e-3);
    expect(box.x).toBeGreaterThanOrEqual(0);
    expect(box.y).toBeGreaterThanOrEqual(0);
  });
});

/** A wheel notch over the canvas (jsdom has no layout, so the stage pointer equals the client point). */
function wheel(deltaY: number, clientX: number, clientY: number, init: WheelEventInit = {}): WheelEvent {
  const event = new WheelEvent("wheel", {
    bubbles: true,
    cancelable: true,
    deltaY,
    clientX,
    clientY,
    ...init,
  });
  act(() => {
    getStage().content.dispatchEvent(event);
  });
  return event;
}

/** The image point under a screen point, from the live stage transform. */
function imageAt(pointer: { x: number; y: number }) {
  const stage = getStage();
  return {
    x: (pointer.x - stage.x()) / stage.scaleX(),
    y: (pointer.y - stage.y()) / stage.scaleX(),
  };
}

function percentText(): string {
  return `${Math.round(getStage().scaleX() * 100)}%`;
}

describe("zoom", () => {
  it("opens fit to the window with a 24 px margin", async () => {
    setUpCanvas();
    stubEditorApi();
    await openEditor();

    const stage = getStage();
    const fit = Math.min(752 / 300, 552 / 200, 4);
    expect(stage.scaleX()).toBeCloseTo(fit, 9);
    expect(stage.x()).toBeCloseTo((800 - 300 * fit) / 2, 6);
    expect(stage.y()).toBeCloseTo((600 - 200 * fit) / 2, 6);
  });

  it("zooms toward the cursor by 1.1 per notch and keeps the point under the cursor", async () => {
    setUpCanvas();
    stubEditorApi();
    await openEditor();
    const fit = getStage().scaleX();
    const pointer = { x: 400, y: 300 };
    const before = imageAt(pointer);

    const event = wheel(-100, pointer.x, pointer.y);

    expect(event.defaultPrevented).toBe(true);
    expect(getStage().scaleX()).toBeCloseTo(fit * 1.1, 9);
    const after = imageAt(pointer);
    expect(after.x).toBeCloseTo(before.x, 6);
    expect(after.y).toBeCloseTo(before.y, 6);
  });

  it("keeps an off-center point fixed and zooms out by 1/1.1 on a downward notch", async () => {
    setUpCanvas();
    stubEditorApi();
    await openEditor();
    const fit = getStage().scaleX();
    const pointer = { x: 150, y: 420 };
    const before = imageAt(pointer);

    wheel(100, pointer.x, pointer.y);

    expect(getStage().scaleX()).toBeCloseTo(fit / 1.1, 9);
    const after = imageAt(pointer);
    expect(after.x).toBeCloseTo(before.x, 6);
    expect(after.y).toBeCloseTo(before.y, 6);
  });

  it("treats Ctrl+wheel (trackpad pinch) like a plain notch", async () => {
    setUpCanvas();
    stubEditorApi();
    await openEditor();
    const fit = getStage().scaleX();

    wheel(-4, 400, 300, { ctrlKey: true });

    expect(getStage().scaleX()).toBeCloseTo(fit * 1.1, 9);
  });

  it("stops at fit x 0.5 and at 1600%", async () => {
    setUpCanvas();
    stubEditorApi();
    await openEditor();
    const fit = getStage().scaleX();

    for (let i = 0; i < 15; i++) {
      wheel(100, 400, 300);
    }
    expect(getStage().scaleX()).toBeCloseTo(fit * 0.5, 9);

    for (let i = 0; i < 60; i++) {
      wheel(-100, 400, 300);
    }
    expect(getStage().scaleX()).toBe(16);
  });

  it("shows the zoom level relative to natural size and follows the wheel", async () => {
    setUpCanvas();
    stubEditorApi();
    await openEditor();

    expect(screen.getByText(percentText())).toBeInTheDocument();
    const initial = percentText();

    wheel(-100, 400, 300);

    expect(percentText()).not.toBe(initial);
    expect(screen.getByText(percentText())).toBeInTheDocument();
  });

  it("returns to fit with the Fit button", async () => {
    setUpCanvas();
    stubEditorApi();
    const { user } = await openEditor();
    const stage = getStage();
    const fit = { scale: stage.scaleX(), x: stage.x(), y: stage.y() };
    wheel(-100, 100, 100);
    wheel(-100, 100, 100);
    expect(stage.scaleX()).not.toBeCloseTo(fit.scale, 3);

    await user.click(screen.getByRole("button", { name: "Fit image to window" }));

    expect(stage.scaleX()).toBeCloseTo(fit.scale, 9);
    expect(stage.x()).toBeCloseTo(fit.x, 6);
    expect(stage.y()).toBeCloseTo(fit.y, 6);
  });

  it("zooms around the canvas center with + and -", async () => {
    setUpCanvas();
    stubEditorApi();
    const { user } = await openEditor();
    const fit = getStage().scaleX();
    const center = { x: 400, y: 300 };
    const before = imageAt(center);

    await user.click(screen.getByRole("button", { name: "Zoom in" }));

    expect(getStage().scaleX()).toBeCloseTo(fit * 1.1, 9);
    expect(imageAt(center).x).toBeCloseTo(before.x, 6);
    expect(imageAt(center).y).toBeCloseTo(before.y, 6);

    await user.click(screen.getByRole("button", { name: "Zoom out" }));

    expect(getStage().scaleX()).toBeCloseTo(fit, 9);
    expect(imageAt(center).x).toBeCloseTo(before.x, 6);
  });

  it("stores a box drawn while zoomed in image coordinates", async () => {
    setUpCanvas();
    const { puts } = stubEditorApi();
    await openEditor();
    wheel(-100, 400, 300);
    wheel(-100, 400, 300);
    const content = getStage().content;
    const from = { x: 200, y: 150 };
    const to = { x: 500, y: 400 };
    const start = imageAt(from);
    const end = imageAt(to);

    firePointer(content, "pointerdown", { clientX: from.x, clientY: from.y });
    firePointer(content, "pointermove", { clientX: to.x, clientY: to.y });
    firePointer(content, "pointerup", { clientX: to.x, clientY: to.y });

    await waitFor(() => expect(puts).toHaveLength(1));
    const [box] = savedBoxes(puts[0]);
    expect(box.x).toBeCloseTo(start.x / 300, 5);
    expect(box.y).toBeCloseTo(start.y / 200, 5);
    expect(box.w).toBeCloseTo((end.x - start.x) / 300, 5);
    expect(box.h).toBeCloseTo((end.y - start.y) / 200, 5);
  });

  it("draws the image without smoothing from 300% up", async () => {
    setUpCanvas();
    stubEditorApi();
    await openEditor();
    const layer = getStage().findOne("Image")?.getLayer();
    expect(layer?.imageSmoothingEnabled()).toBe(true);

    wheel(-100, 400, 300);
    wheel(-100, 400, 300);

    expect(getStage().scaleX()).toBeGreaterThanOrEqual(3);
    expect(layer?.imageSmoothingEnabled()).toBe(false);
  });

  it("keeps stroke, anchor and chip screen sizes while zoomed", async () => {
    setUpCanvas();
    stubEditorApi({ boxes: [BOX] });
    await openEditor();
    wheel(-100, 400, 300);
    wheel(-100, 400, 300);

    const scale = getStage().scaleX();
    const label = getStage().findOne(`#label-${BOX_ID}`) as Konva.Label;
    expect(label.getTag().height() * scale).toBeCloseTo(16, 3);
    expect(label.getText().fontSize() * scale).toBeCloseTo(12, 3);
    expect(boxNode().strokeScaleEnabled()).toBe(false);
  });
});
