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
import { resetEditors } from "../store/storeRegistry";

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
