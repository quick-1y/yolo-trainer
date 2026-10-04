import { screen, waitFor } from "@testing-library/react";
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
import { resetEditors } from "./store/storeRegistry";

const BOX_ID = "3f2b8c1e-5d4a-4e7b-9c6d-1a2b3c4d5e6f";
const UUID_V4 = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;

function setUpCanvas(): void {
  stubImageDecoding(300, 200);
  stubElementSize(800, 600);
  installPointerCaptureStubs();
}

/** Render the editor and wait until the original has loaded and the stage is mounted. */
async function openEditor() {
  const rendered = renderWithProviders(<AppRoutes />, { route: "/projects/1/annotate/5" });
  await screen.findByRole("application");
  // The original has decoded once the Konva Image node exists on the stage.
  await waitFor(() => expect(getStage().findOne("Image")).toBeTruthy());
  return rendered;
}

function content(): HTMLElement {
  return getStage().content;
}

function drag(from: [number, number], to: [number, number]): void {
  firePointer(content(), "pointerdown", { clientX: from[0], clientY: from[1] });
  firePointer(content(), "pointermove", { clientX: to[0], clientY: to[1] });
  firePointer(content(), "pointerup", { clientX: to[0], clientY: to[1] });
}

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

afterEach(resetEditors);

describe("EditorPage (tracer)", () => {
  it("draws a box, saves it with one PUT and shows Saved", async () => {
    setUpCanvas();
    const { puts } = stubEditorApi();
    await openEditor();

    drag([100, 100], [400, 300]);

    await waitFor(() => expect(screen.getByRole("status")).toHaveTextContent("Saving…"));
    await waitFor(() => expect(puts).toHaveLength(1));
    const body = puts[0] as {
      base_version: number;
      is_background: boolean;
      is_reviewed: boolean;
      boxes: Array<{ id: string; class_id: number; x: number; y: number; w: number; h: number }>;
    };
    expect(body.base_version).toBe(0);
    expect(body.is_background).toBe(false);
    expect(body.is_reviewed).toBe(false);
    expect(body.boxes).toHaveLength(1);
    const [box] = body.boxes;
    expect(box.class_id).toBe(7);
    expect(box.id).toMatch(UUID_V4);
    for (const value of [box.x, box.y, box.w, box.h]) {
      expect(value).toBeGreaterThanOrEqual(0);
      expect(value).toBeLessThanOrEqual(1);
    }
    expect(box.w).toBeGreaterThan(0);
    expect(box.h).toBeGreaterThan(0);
    await waitFor(() => expect(screen.getByRole("status")).toHaveTextContent("Saved"));
  });

  it("creates nothing for a 2 pixel drag", async () => {
    setUpCanvas();
    const { puts } = stubEditorApi();
    await openEditor();

    drag([100, 100], [102, 102]);
    await sleep(1000);

    expect(puts).toHaveLength(0);
    expect(screen.getByRole("status")).toHaveTextContent("Saved");
  });

  it("commits a box whose pointerup lands outside the stage, clipped to the image", async () => {
    setUpCanvas();
    const { puts } = stubEditorApi();
    await openEditor();

    firePointer(content(), "pointerdown", { clientX: 700, clientY: 500 });
    firePointer(content(), "pointerup", { clientX: 5000, clientY: 5000 });

    await waitFor(() => expect(puts).toHaveLength(1));
    const [box] = (puts[0] as { boxes: Array<{ x: number; y: number; w: number; h: number }> })
      .boxes;
    expect(box.x + box.w).toBeLessThanOrEqual(1);
    expect(box.y + box.h).toBeLessThanOrEqual(1);
    expect(box.x + box.w).toBeCloseTo(1, 5);
    expect(box.y + box.h).toBeCloseTo(1, 5);
  });

  it("shows the hint and draws nothing when the project has no classes", async () => {
    setUpCanvas();
    const { puts } = stubEditorApi({ classes: [] });
    await openEditor();

    expect(await screen.findByText("Add a class to start drawing.")).toBeInTheDocument();
    drag([100, 100], [400, 300]);
    await sleep(1000);

    expect(puts).toHaveLength(0);
  });

  it("shows the saved boxes again after a reload", async () => {
    setUpCanvas();
    stubEditorApi({
      version: 3,
      boxes: [{ id: BOX_ID, class_id: 7, x: 0.1, y: 0.1, w: 0.5, h: 0.5 }],
    });
    await openEditor();

    await waitFor(() => {
      const rect = getStage().findOne(`#box-${BOX_ID}`) as Konva.Rect | undefined;
      expect(rect).toBeDefined();
      expect(rect?.width()).toBeCloseTo(150, 3);
    });
  });

  it("shows Image not found with a link back to the images", async () => {
    setUpCanvas();
    stubEditorApi({ imageStatus: 404 });

    renderWithProviders(<AppRoutes />, { route: "/projects/1/annotate/5" });

    expect(await screen.findByText("Image not found")).toBeInTheDocument();
    const link = screen.getByRole("link", { name: "Back to images" });
    expect(link).toHaveAttribute("href", "/projects/1/images");
  });

  it("renders outside the app shell: no project sidebar", async () => {
    setUpCanvas();
    stubEditorApi();
    await openEditor();

    expect(screen.queryByRole("link", { name: "Overview" })).not.toBeInTheDocument();
    expect(screen.getByText("photo.jpg")).toBeInTheDocument();
  });
});
