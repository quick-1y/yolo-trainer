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
import { CAR_CLASS, stubEditorApi } from "../../test/editorApi";
import { renderWithProviders } from "../../test/render";
import { resetEditorUi, useEditorUi } from "./store/editorUiStore";
import { peekEditor, resetEditors } from "./store/storeRegistry";

const BOX_ID = "3f2b8c1e-5d4a-4e7b-9c6d-1a2b3c4d5e6f";
const BOX = { id: BOX_ID, class_id: 7, x: 0.1, y: 0.2, w: 0.5, h: 0.5 };
const PLANE = { ...CAR_CLASS, id: 8, name: "plane", color: "#3CB44B", index: 1 };
const SHIP = { ...CAR_CLASS, id: 9, name: "ship", color: "#4363D8", index: 2 };
const THREE = [CAR_CLASS, PLANE, SHIP];

type SavedBox = { id: string; class_id: number };

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

function savedBoxes(put: Record<string, unknown>): SavedBox[] {
  return (put as { boxes: SavedBox[] }).boxes;
}

function drag(from: [number, number], to: [number, number]): void {
  const content = getStage().content;
  firePointer(content, "pointerdown", { clientX: from[0], clientY: from[1] });
  firePointer(content, "pointermove", { clientX: to[0], clientY: to[1] });
  firePointer(content, "pointerup", { clientX: to[0], clientY: to[1] });
}

function press(init: KeyboardEventInit): void {
  act(() => {
    document.body.dispatchEvent(new KeyboardEvent("keydown", { bubbles: true, cancelable: true, ...init }));
  });
}

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

function toolButton(name: "Select" | "Box"): HTMLElement {
  return within(screen.getByRole("toolbar")).getByRole("button", { name });
}

function panel(): HTMLElement {
  return screen.getByTestId("class-panel");
}

/** The class row button for a class name. */
function row(name: string): HTMLElement {
  const button = within(panel()).getByText(name).closest("button");
  if (button === null) {
    throw new Error(`No class row for ${name}`);
  }
  return button;
}

async function selectBox() {
  const rendered = await openEditor();
  await rendered.user.click(toolButton("Select"));
  act(() => {
    (getStage().findOne(`#box-${BOX_ID}`) as Konva.Rect).fire("click", {});
  });
  await waitFor(() => expect(useEditorUi.getState().selectedId).toBe(BOX_ID));
  return rendered;
}

afterEach(() => {
  resetEditors();
  resetEditorUi();
});

describe("class list", () => {
  it("shows the count, a digit hint, swatch and name per class, with the first class active", async () => {
    setUpCanvas();
    stubEditorApi({ classes: THREE });
    await openEditor();

    expect(await within(panel()).findByText("Classes: 3")).toBeInTheDocument();
    for (const [index, name] of ["car", "plane", "ship"].entries()) {
      expect(within(row(name)).getByText(String(index + 1))).toBeInTheDocument();
      expect(row(name).querySelector("kbd")).not.toBeNull();
    }
    expect(row("car")).toHaveAttribute("aria-pressed", "true");
    expect(row("plane")).toHaveAttribute("aria-pressed", "false");
  });

  it("shows no digit hint for the tenth class and still lets it be clicked", async () => {
    setUpCanvas();
    const many = Array.from({ length: 10 }, (_, index) => ({
      ...CAR_CLASS,
      id: 20 + index,
      name: `kind-${index + 1}`,
      index,
    }));
    stubEditorApi({ classes: many });
    const { user } = await openEditor();

    await within(panel()).findByText("Classes: 10");
    expect(row("kind-9").querySelector("kbd")).not.toBeNull();
    expect(row("kind-10").querySelector("kbd")).toBeNull();

    await user.click(row("kind-10"));
    expect(row("kind-10")).toHaveAttribute("aria-pressed", "true");
  });

  it("counts the objects of each class on this image", async () => {
    setUpCanvas();
    stubEditorApi({
      classes: THREE,
      boxes: [BOX, { ...BOX, id: "b2" }, { ...BOX, id: "b3", class_id: 9 }],
    });
    await openEditor();

    const car = await screen.findByLabelText("car: objects on this image: 2");
    expect(car).toHaveTextContent("2");
    expect(screen.getByLabelText("ship: objects on this image: 1")).toHaveTextContent("1");
    expect(screen.getByLabelText("plane: objects on this image: 0")).toHaveTextContent("0");
  });

  it("falls back to the first class when the stored active class no longer exists", async () => {
    setUpCanvas();
    stubEditorApi({ classes: THREE });
    useEditorUi.getState().setActiveClass(999);
    await openEditor();

    await within(panel()).findByText("Classes: 3");
    expect(row("car")).toHaveAttribute("aria-pressed", "true");
  });

  it("keeps the active class when a new image opens", () => {
    useEditorUi.getState().setActiveClass(8);

    useEditorUi.getState().resetForImage();

    expect(useEditorUi.getState().activeClassId).toBe(8);
  });
});

describe("active class", () => {
  it("makes a clicked class active and gives it to the next drawn box", async () => {
    setUpCanvas();
    const { puts } = stubEditorApi({ classes: THREE });
    const { user } = await openEditor();
    await within(panel()).findByText("Classes: 3");

    await user.click(row("plane"));

    expect(row("plane")).toHaveAttribute("aria-pressed", "true");
    expect(row("car")).toHaveAttribute("aria-pressed", "false");
    drag([100, 100], [400, 300]);
    await waitFor(() => expect(puts).toHaveLength(1));
    expect(savedBoxes(puts[0])[0].class_id).toBe(8);
  });

  it("makes the class of a digit key active when nothing is selected", async () => {
    setUpCanvas();
    const { puts } = stubEditorApi({ classes: THREE });
    await openEditor();
    await within(panel()).findByText("Classes: 3");

    press({ code: "Digit2", key: "2" });

    expect(row("plane")).toHaveAttribute("aria-pressed", "true");
    drag([100, 100], [400, 300]);
    await waitFor(() => expect(puts).toHaveLength(1));
    expect(savedBoxes(puts[0])[0].class_id).toBe(8);
  });

  it("ignores a digit above the number of classes", async () => {
    setUpCanvas();
    const { puts } = stubEditorApi({ classes: THREE, boxes: [BOX] });
    await selectBox();
    await within(panel()).findByText("Classes: 3");

    press({ code: "Digit9", key: "9" });
    await sleep(700);

    expect(puts).toHaveLength(0);
    expect(row("car")).toHaveAttribute("aria-pressed", "true");
    expect(peekEditor({ projectId: 1, imageId: 5 })?.store.getState().doc.boxes[0].class_id).toBe(7);
  });

  it("uses the only class as the active one", async () => {
    setUpCanvas();
    stubEditorApi();
    await openEditor();

    expect(await within(panel()).findByText("Classes: 1")).toBeInTheDocument();
    expect(row("car")).toHaveAttribute("aria-pressed", "true");
  });
});

describe("changing the class of the selected box", () => {
  it("shows the hint while a box is selected and nothing otherwise", async () => {
    setUpCanvas();
    stubEditorApi({ classes: THREE, boxes: [BOX] });
    const { user } = await openEditor();
    await within(panel()).findByText("Classes: 3");
    expect(screen.queryByText("Selected box: choose a class to change it.")).not.toBeInTheDocument();

    await user.click(toolButton("Select"));
    act(() => {
      (getStage().findOne(`#box-${BOX_ID}`) as Konva.Rect).fire("click", {});
    });

    expect(await screen.findByText("Selected box: choose a class to change it.")).toBeInTheDocument();
  });

  it("reclassifies the box on a row click with one save and keeps the active class", async () => {
    setUpCanvas();
    const { puts } = stubEditorApi({ classes: THREE, boxes: [BOX] });
    const { user } = await selectBox();
    await within(panel()).findByText("Classes: 3");

    await user.click(row("ship"));

    await waitFor(() => expect(puts).toHaveLength(1));
    expect(savedBoxes(puts[0])).toHaveLength(1);
    expect(savedBoxes(puts[0])[0].class_id).toBe(9);
    expect(row("car")).toHaveAttribute("aria-pressed", "true");
    expect(row("ship")).toHaveAttribute("aria-pressed", "false");
    await sleep(700);
    expect(puts).toHaveLength(1);
  });

  it("reclassifies the box on a digit key", async () => {
    setUpCanvas();
    const { puts } = stubEditorApi({ classes: THREE, boxes: [BOX] });
    await selectBox();
    await within(panel()).findByText("Classes: 3");

    press({ code: "Digit3", key: "3" });

    await waitFor(() => expect(puts).toHaveLength(1));
    expect(savedBoxes(puts[0])[0].class_id).toBe(9);
    expect(row("car")).toHaveAttribute("aria-pressed", "true");
  });

  it("clears the reviewed flag in the same save, and undo restores the class", async () => {
    setUpCanvas();
    const { puts } = stubEditorApi({ classes: THREE, boxes: [BOX], isReviewed: true });
    const { user } = await selectBox();
    await within(panel()).findByText("Classes: 3");

    await user.click(row("plane"));

    await waitFor(() => expect(puts).toHaveLength(1));
    expect(puts[0].is_reviewed).toBe(false);
    expect(savedBoxes(puts[0])[0].class_id).toBe(8);

    await user.click(within(screen.getByRole("toolbar")).getByRole("button", { name: "Undo" }));

    await waitFor(() => expect(puts).toHaveLength(2));
    expect(savedBoxes(puts[1])[0].class_id).toBe(7);
    expect(puts[1].is_reviewed).toBe(true);
  });
});

describe("a project without classes", () => {
  it("shows the empty state with the add form open and drawing disabled", async () => {
    setUpCanvas();
    stubEditorApi({ classes: [] });
    await openEditor();

    expect(await within(panel()).findByText("No classes yet")).toBeInTheDocument();
    expect(within(panel()).getByText("Add a class to start drawing boxes.")).toBeInTheDocument();
    expect(within(panel()).getByLabelText("Class name")).toBeVisible();
    expect(toolButton("Box")).toBeDisabled();
  });

  it("creates the first class in place, makes it active and enables drawing", async () => {
    setUpCanvas();
    const { posts, puts } = stubEditorApi({ classes: [] });
    const { user } = await openEditor();
    await within(panel()).findByText("No classes yet");

    await user.type(within(panel()).getByLabelText("Class name"), "car");
    await user.click(within(panel()).getByRole("button", { name: "Add class" }));

    await waitFor(() => expect(posts).toEqual([{ name: "car" }]));
    await waitFor(() => expect(toolButton("Box")).toBeEnabled());
    expect(row("car")).toHaveAttribute("aria-pressed", "true");
    expect(useEditorUi.getState().activeClassId).toBe(100);
    drag([100, 100], [400, 300]);
    await waitFor(() => expect(puts).toHaveLength(1));
    expect(savedBoxes(puts[0])[0].class_id).toBe(100);
  });

  it("opens the add form from the panel when classes exist", async () => {
    setUpCanvas();
    const { posts } = stubEditorApi({ classes: THREE });
    const { user } = await openEditor();
    await within(panel()).findByText("Classes: 3");

    await user.click(within(panel()).getByRole("button", { name: "Add class" }));
    await user.type(await within(panel()).findByLabelText("Class name"), "bus");
    await user.click(within(panel()).getAllByRole("button", { name: "Add class" })[1]);

    await waitFor(() => expect(posts).toEqual([{ name: "bus" }]));
    // The created class is not the first class of the project, so the active class stays.
    await within(panel()).findByText("Classes: 4");
    expect(row("car")).toHaveAttribute("aria-pressed", "true");
  });
});

describe("loading and failure", () => {
  it("shows three skeleton rows while the classes load", async () => {
    setUpCanvas();
    stubEditorApi({ classesMode: "pending" });
    await openEditor();

    expect(panel().querySelectorAll(".mantine-Skeleton-root")).toHaveLength(3);
    expect(toolButton("Box")).toBeDisabled();
  });

  it("shows a small alert with the API message and refetches on Try again", async () => {
    setUpCanvas();
    const { setClassesMode } = stubEditorApi({ classesMode: "error" });
    const { user } = await openEditor();

    expect(await within(panel()).findByText("Classes are unavailable.")).toBeInTheDocument();
    expect(toolButton("Box")).toBeDisabled();

    setClassesMode("ok");
    await user.click(within(panel()).getByRole("button", { name: "Try again" }));

    expect(await within(panel()).findByText("Classes: 1")).toBeInTheDocument();
    expect(row("car")).toHaveAttribute("aria-pressed", "true");
  });
});
