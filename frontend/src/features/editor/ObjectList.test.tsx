import { MantineProvider } from "@mantine/core";
import { act, render, screen, waitFor, within } from "@testing-library/react";
import type Konva from "konva";
import { VirtuosoMockContext } from "react-virtuoso";
import { afterEach, describe, expect, it } from "vitest";

import { AppRoutes } from "../../app/routes";
import i18n from "../../i18n";
import { theme } from "../../theme";
import { getStage, installPointerCaptureStubs, stubElementSize, stubImageDecoding } from "../../test/canvas";
import { CAR_CLASS, stubEditorApi } from "../../test/editorApi";
import { renderWithProviders } from "../../test/render";
import { ObjectList } from "./ObjectList";
import { resetEditorUi, useEditorUi } from "./store/editorUiStore";
import { resetEditors } from "./store/storeRegistry";

const ID1 = "11111111-1111-4111-8111-111111111111";
const ID2 = "22222222-2222-4222-8222-222222222222";
const ID3 = "33333333-3333-4333-8333-333333333333";
const BOXES = [
  { id: ID1, class_id: 7, x: 0.05, y: 0.05, w: 0.2, h: 0.2 },
  { id: ID2, class_id: 7, x: 0.3, y: 0.3, w: 0.2, h: 0.2 },
  { id: ID3, class_id: 9, x: 0.6, y: 0.6, w: 0.2, h: 0.2 },
];
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
  const rendered = renderWithProviders(
    <VirtuosoMockContext.Provider value={{ viewportHeight: 400, itemHeight: 40 }}>
      <AppRoutes />
    </VirtuosoMockContext.Provider>,
    { route: "/projects/1/annotate/5" },
  );
  await screen.findByRole("application");
  await waitFor(() => expect(getStage().findOne("Image")).toBeTruthy());
  return rendered;
}

function savedBoxes(put: Record<string, unknown>): SavedBox[] {
  return (put as { boxes: SavedBox[] }).boxes;
}

function press(init: KeyboardEventInit): void {
  act(() => {
    document.body.dispatchEvent(new KeyboardEvent("keydown", { bubbles: true, cancelable: true, ...init }));
  });
}

function toolButton(name: "Select" | "Box"): HTMLElement {
  return within(screen.getByRole("toolbar")).getByRole("button", { name });
}

function rows(): HTMLElement[] {
  return screen.queryAllByTestId("object-row");
}

function boxNode(id: string): Konva.Rect {
  return getStage().findOne(`#box-${id}`) as Konva.Rect;
}

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

afterEach(() => {
  resetEditors();
  resetEditorUi();
});

describe("object list content", () => {
  it("shows the count and one row per box with its ordinal, in annotation order", async () => {
    setUpCanvas();
    stubEditorApi({ classes: THREE, boxes: BOXES });
    await openEditor();

    expect(await screen.findByText("Objects: 3")).toBeInTheDocument();
    await waitFor(() => expect(rows()).toHaveLength(3));
    expect(rows().map((row) => within(row).getByTestId("object-ordinal").textContent)).toEqual([
      "1",
      "2",
      "3",
    ]);
    expect(within(rows()[2]).getByLabelText("Class of object 3")).toHaveValue("ship");
  });

  it("shows the empty state with the draw hint when the image has no boxes", async () => {
    setUpCanvas();
    stubEditorApi({ classes: THREE });
    await openEditor();

    expect(await screen.findByText("Objects: 0")).toBeInTheDocument();
    expect(screen.getByText("No objects on this image")).toBeInTheDocument();
    expect(screen.getByText(/Press B and drag on the image to draw a box/)).toBeInTheDocument();
    expect(rows()).toHaveLength(0);
  });

  it("uses the same label for one box", async () => {
    setUpCanvas();
    stubEditorApi({ classes: THREE, boxes: [BOXES[0]] });
    await openEditor();

    expect(await screen.findByText("Objects: 1")).toBeInTheDocument();
    await waitFor(() => expect(rows()).toHaveLength(1));
  });

  it("shows three skeleton rows until the annotation set is loaded", async () => {
    await i18n.changeLanguage("en");
    const { container } = render(
      <MantineProvider theme={theme} forceColorScheme="dark">
        <ObjectList store={null} classes={undefined} onReleaseFocus={() => undefined} />
      </MantineProvider>,
    );

    expect(container.querySelectorAll(".mantine-Skeleton-root")).toHaveLength(3);
    expect(screen.queryByText("No objects on this image")).not.toBeInTheDocument();
  });

  it("mounts only the visible rows for 2000 boxes", async () => {
    setUpCanvas();
    const many = Array.from({ length: 2000 }, (_, index) => ({
      id: `00000000-0000-4000-8000-${String(index).padStart(12, "0")}`,
      class_id: 7,
      x: 0.1,
      y: 0.1,
      w: 0.1,
      h: 0.1,
    }));
    stubEditorApi({ classes: THREE, boxes: many });
    await openEditor();

    expect(await screen.findByText("Objects: 2000")).toBeInTheDocument();
    await waitFor(() => expect(rows().length).toBeGreaterThan(0));
    expect(rows().length).toBeLessThan(100);
  });
});

describe("selecting from the list", () => {
  it("selects a box on a row click, keeps it selected on a second click and attaches the Transformer", async () => {
    setUpCanvas();
    stubEditorApi({ classes: THREE, boxes: BOXES });
    const { user } = await openEditor();
    await waitFor(() => expect(rows()).toHaveLength(3));

    await user.click(within(rows()[1]).getByTestId("object-ordinal"));

    await waitFor(() => expect(useEditorUi.getState().selectedId).toBe(ID2));
    await waitFor(() => {
      const transformer = getStage().findOne("Transformer") as Konva.Transformer;
      expect(transformer.nodes().map((node) => node.id())).toEqual([`box-${ID2}`]);
    });
    expect(rows()[1]).toHaveAttribute("data-active", "true");

    await user.click(within(rows()[1]).getByTestId("object-ordinal"));

    expect(useEditorUi.getState().selectedId).toBe(ID2);
    expect(toolButton("Select")).toHaveAttribute("aria-pressed", "true");
  });
});

describe("hiding an object", () => {
  it("removes the box from the canvas and dims the row, then brings it back", async () => {
    setUpCanvas();
    stubEditorApi({ classes: THREE, boxes: BOXES });
    const { user } = await openEditor();
    await waitFor(() => expect(rows()).toHaveLength(3));
    expect(boxNode(ID1)).toBeTruthy();

    const hide = within(rows()[0]).getByRole("button", { name: "Hide object 1" });
    expect(hide).toHaveAttribute("aria-pressed", "false");
    await user.click(hide);

    await waitFor(() => expect(getStage().findOne(`#box-${ID1}`)).toBeUndefined());
    expect(rows()).toHaveLength(3);
    expect(rows()[0].style.opacity).toBe("0.5");
    const show = within(rows()[0]).getByRole("button", { name: "Show object 1" });
    expect(show).toHaveAttribute("aria-pressed", "true");
    expect(boxNode(ID2)).toBeTruthy();

    await user.click(show);

    await waitFor(() => expect(boxNode(ID1)).toBeTruthy());
    expect(rows()[0].style.opacity).toBe("1");
  });

  it("forgets hidden objects when another image opens", () => {
    useEditorUi.getState().toggleHidden(ID1);
    expect(useEditorUi.getState().hiddenIds.has(ID1)).toBe(true);

    useEditorUi.getState().resetForImage();

    expect(useEditorUi.getState().hiddenIds.size).toBe(0);
  });

  it("toggles an id on and off without touching other ids", () => {
    useEditorUi.getState().toggleHidden(ID1);
    useEditorUi.getState().toggleHidden(ID2);
    useEditorUi.getState().toggleHidden(ID1);

    expect([...useEditorUi.getState().hiddenIds]).toEqual([ID2]);
  });
});

describe("changing the class from a row", () => {
  it("saves the new class once and hands the keyboard back to the editor shortcuts", async () => {
    setUpCanvas();
    const { puts } = stubEditorApi({ classes: THREE, boxes: BOXES });
    const { user } = await openEditor();
    await waitFor(() => expect(rows()).toHaveLength(3));

    await user.click(within(rows()[2]).getByLabelText("Class of object 3"));
    await user.click(await screen.findByRole("option", { name: "plane" }));

    await waitFor(() => expect(puts).toHaveLength(1));
    expect(savedBoxes(puts[0]).map((box) => box.class_id)).toEqual([7, 7, 8]);
    await sleep(700);
    expect(puts).toHaveLength(1);
    expect(document.activeElement?.tagName).not.toBe("INPUT");
    expect(toolButton("Box")).toHaveAttribute("aria-pressed", "true");

    press({ code: "KeyV", key: "v" });

    expect(toolButton("Select")).toHaveAttribute("aria-pressed", "true");
  });

  it("does not select the box just because its dropdown was used", async () => {
    setUpCanvas();
    stubEditorApi({ classes: THREE, boxes: BOXES });
    const { user } = await openEditor();
    await waitFor(() => expect(rows()).toHaveLength(3));

    await user.click(within(rows()[2]).getByLabelText("Class of object 3"));
    await user.click(await screen.findByRole("option", { name: "plane" }));

    expect(useEditorUi.getState().selectedId).toBeNull();
  });
});

describe("deleting from a row", () => {
  it("saves without the box, and Ctrl+Z brings it back", async () => {
    setUpCanvas();
    const { puts } = stubEditorApi({ classes: THREE, boxes: BOXES });
    const { user } = await openEditor();
    await waitFor(() => expect(rows()).toHaveLength(3));

    await user.click(within(rows()[0]).getByRole("button", { name: "Delete object 1" }));

    await waitFor(() => expect(puts).toHaveLength(1));
    expect(savedBoxes(puts[0]).map((box) => box.id)).toEqual([ID2, ID3]);
    await waitFor(() => expect(rows()).toHaveLength(2));

    press({ code: "KeyZ", key: "z", ctrlKey: true });

    await waitFor(() => expect(puts).toHaveLength(2));
    expect(savedBoxes(puts[1]).map((box) => box.id)).toEqual([ID1, ID2, ID3]);
    await waitFor(() => expect(rows()).toHaveLength(3));
  });
});

describe("hover sync", () => {
  it("highlights the canvas box while a row is hovered", async () => {
    setUpCanvas();
    stubEditorApi({ classes: THREE, boxes: BOXES });
    const { user } = await openEditor();
    await waitFor(() => expect(rows()).toHaveLength(3));
    expect(boxNode(ID2).strokeWidth()).toBe(2);

    await user.hover(rows()[1]);

    await waitFor(() => expect(boxNode(ID2).strokeWidth()).toBe(3));
    expect(rows()[1]).toHaveAttribute("data-hovered", "true");

    await user.unhover(rows()[1]);

    await waitFor(() => expect(boxNode(ID2).strokeWidth()).toBe(2));
    expect(rows()[1]).not.toHaveAttribute("data-hovered");
  });

  it("highlights the row while its canvas box is hovered", async () => {
    setUpCanvas();
    stubEditorApi({ classes: THREE, boxes: BOXES });
    const { user } = await openEditor();
    await user.click(toolButton("Select"));
    await waitFor(() => expect(rows()).toHaveLength(3));

    act(() => {
      boxNode(ID2).fire("mouseenter", {});
    });

    await waitFor(() => expect(rows()[1]).toHaveAttribute("data-hovered", "true"));
    expect(rows()[0]).not.toHaveAttribute("data-hovered");
  });
});
