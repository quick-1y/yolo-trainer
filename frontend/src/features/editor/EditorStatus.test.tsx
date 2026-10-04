import { act, screen, waitFor, within } from "@testing-library/react";
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
import { resetEditorUi } from "./store/editorUiStore";
import { peekEditor, resetEditors } from "./store/storeRegistry";

const BOX_ID = "3f2b8c1e-5d4a-4e7b-9c6d-1a2b3c4d5e6f";
const BOX = { id: BOX_ID, class_id: 7, x: 0.1, y: 0.2, w: 0.5, h: 0.5 };

type Put = {
  is_background: boolean;
  is_reviewed: boolean;
  boxes: Array<{ id: string }>;
};

const realMatchMedia = window.matchMedia;

/** The viewport is at least 1440px wide (the top bar shows full labels) or narrower. */
function setWideViewport(wide: boolean): void {
  window.matchMedia = (query: string) => ({
    matches: wide && query.includes("(min-width: 1440px)"),
    media: query,
    onchange: null,
    addListener: () => undefined,
    removeListener: () => undefined,
    addEventListener: () => undefined,
    removeEventListener: () => undefined,
    dispatchEvent: () => false,
  });
}

function setUpCanvas(): void {
  stubImageDecoding(300, 200);
  stubElementSize(800, 600);
  installPointerCaptureStubs();
}

async function openEditor(language = "en") {
  const rendered = renderWithProviders(<AppRoutes />, {
    route: "/projects/1/annotate/5",
    language,
  });
  await screen.findByRole("application");
  await waitFor(() => expect(getStage().findOne("Image")).toBeTruthy());
  return rendered;
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

const badge = () => screen.getByTestId("status-badge");
const backgroundButton = () => screen.getByRole("button", { name: /^(✓ )?Background$/ });
const reviewedButton = () => screen.getByRole("button", { name: /^(✓ )?(Mark as reviewed|Reviewed)$/ });

afterEach(() => {
  window.matchMedia = realMatchMedia;
  resetEditors();
  resetEditorUi();
});

describe("status badge", () => {
  it("shows Unannotated with a glyph for an empty image and disables Mark as reviewed", async () => {
    setUpCanvas();
    stubEditorApi();
    await openEditor();

    expect(badge()).toHaveTextContent("Unannotated");
    expect(badge()).toHaveTextContent("○");
    expect(badge()).toHaveAttribute("aria-label", "Unannotated");
    expect(reviewedButton()).toBeDisabled();
    expect(backgroundButton()).toBeEnabled();
    expect(backgroundButton()).toHaveAttribute("aria-pressed", "false");
  });

  it("shows Annotated for an image with a box and enables Mark as reviewed", async () => {
    setUpCanvas();
    stubEditorApi({ boxes: [BOX] });
    await openEditor();

    expect(badge()).toHaveTextContent("Annotated");
    expect(badge()).toHaveTextContent("●");
    expect(reviewedButton()).toBeEnabled();
    expect(backgroundButton()).toBeDisabled();
  });

  it("shows Background for a flagged image and keeps Unannotated distinct", async () => {
    setUpCanvas();
    stubEditorApi({ isBackground: true });
    await openEditor();

    expect(badge()).toHaveTextContent("Background");
    expect(badge()).toHaveTextContent("∅");
    expect(backgroundButton()).toHaveAttribute("aria-pressed", "true");
    expect(reviewedButton()).toBeEnabled();
  });

  it("shows Reviewed for a background image marked reviewed while Background stays pressed", async () => {
    setUpCanvas();
    stubEditorApi({ isBackground: true, isReviewed: true });
    await openEditor();

    expect(badge()).toHaveTextContent("Reviewed");
    expect(badge()).toHaveTextContent("✓");
    expect(backgroundButton()).toHaveAttribute("aria-pressed", "true");
    expect(reviewedButton()).toHaveAttribute("aria-pressed", "true");
  });
});

describe("background", () => {
  it("marks an empty image as background with one save and shows the background body", async () => {
    setUpCanvas();
    const { puts } = stubEditorApi();
    const { user } = await openEditor();

    await user.click(backgroundButton());

    await waitFor(() => expect(puts).toHaveLength(1));
    expect(puts[0]).toMatchObject({ is_background: true, is_reviewed: false, boxes: [] });
    expect(badge()).toHaveTextContent("Background");
    expect(backgroundButton()).toHaveAttribute("aria-pressed", "true");
    expect(
      screen.getByText("Marked as background: this image has no objects."),
    ).toBeInTheDocument();
    expect(screen.queryAllByTestId("object-row")).toHaveLength(0);
  });

  it("drawing a box on a background image clears the flag in one save and disables Background", async () => {
    setUpCanvas();
    const { puts } = stubEditorApi({ isBackground: true });
    await openEditor();

    drag([100, 100], [400, 300]);

    await waitFor(() => expect(puts).toHaveLength(1));
    const put = puts[0] as unknown as Put;
    expect(put.is_background).toBe(false);
    expect(put.boxes).toHaveLength(1);
    await waitFor(() => expect(backgroundButton()).toBeDisabled());
    expect(badge()).toHaveTextContent("Annotated");
    expect(puts).toHaveLength(1);
  });

  it("Remove background mark clears the flag with one save", async () => {
    setUpCanvas();
    const { puts } = stubEditorApi({ isBackground: true });
    const { user } = await openEditor();

    await user.click(screen.getByRole("button", { name: "Remove background mark" }));

    await waitFor(() => expect(puts).toHaveLength(1));
    expect(puts[0]).toMatchObject({ is_background: false, boxes: [] });
    expect(badge()).toHaveTextContent("Unannotated");
    expect(screen.queryByText("Marked as background: this image has no objects.")).toBeNull();
  });

  it("G toggles the background flag", async () => {
    setUpCanvas();
    const { puts } = stubEditorApi();
    await openEditor();

    press({ code: "KeyG", key: "g" });

    await waitFor(() => expect(puts).toHaveLength(1));
    expect(puts[0]).toMatchObject({ is_background: true });
    press({ code: "KeyG", key: "g" });
    await waitFor(() => expect(puts).toHaveLength(2));
    expect(puts[1]).toMatchObject({ is_background: false });
  });

  it("G does nothing while the image has boxes", async () => {
    setUpCanvas();
    const { puts } = stubEditorApi({ boxes: [BOX] });
    await openEditor();

    press({ code: "KeyG", key: "g" });

    await new Promise((resolve) => setTimeout(resolve, 900));
    expect(puts).toHaveLength(0);
    expect(badge()).toHaveTextContent("Annotated");
  });
});

describe("reviewed", () => {
  it("R marks the image reviewed, and a later edit demotes it to annotated", async () => {
    setUpCanvas();
    const { puts } = stubEditorApi({ boxes: [BOX] });
    await openEditor();

    press({ code: "KeyR", key: "r" });

    await waitFor(() => expect(puts).toHaveLength(1));
    expect(puts[0]).toMatchObject({ is_reviewed: true });
    expect(badge()).toHaveTextContent("Reviewed");
    expect(reviewedButton()).toHaveAttribute("aria-pressed", "true");

    const entry = peekEditor({ projectId: 1, imageId: 5 });
    act(() => {
      entry?.store.getState().updateBox(BOX_ID, { x: 0.3, y: 0.3, w: 0.4, h: 0.4 });
    });

    await waitFor(() => expect(puts).toHaveLength(2));
    expect(puts[1]).toMatchObject({ is_reviewed: false });
    expect(badge()).toHaveTextContent("Annotated");
    expect(reviewedButton()).toHaveAttribute("aria-pressed", "false");
  });

  it("pressing R on a reviewed image removes the flag", async () => {
    setUpCanvas();
    const { puts } = stubEditorApi({ boxes: [BOX], isReviewed: true });
    const { user } = await openEditor();

    await user.click(reviewedButton());

    await waitFor(() => expect(puts).toHaveLength(1));
    expect(puts[0]).toMatchObject({ is_reviewed: false });
    expect(badge()).toHaveTextContent("Annotated");
  });

  it("R does nothing on an unannotated image", async () => {
    setUpCanvas();
    const { puts } = stubEditorApi();
    await openEditor();

    press({ code: "KeyR", key: "r" });

    await new Promise((resolve) => setTimeout(resolve, 900));
    expect(puts).toHaveLength(0);
    expect(badge()).toHaveTextContent("Unannotated");
  });

  it("marks a background image reviewed without clearing the background flag", async () => {
    setUpCanvas();
    const { puts } = stubEditorApi({ isBackground: true });
    const { user } = await openEditor();

    await user.click(reviewedButton());

    await waitFor(() => expect(puts).toHaveLength(1));
    expect(puts[0]).toMatchObject({ is_background: true, is_reviewed: true });
    expect(badge()).toHaveTextContent("Reviewed");
  });
});

describe("top bar layout", () => {
  it("collapses Background and Reviewed to icon buttons with aria-labels below 1440px", async () => {
    setUpCanvas();
    setWideViewport(false);
    stubEditorApi({ boxes: [BOX] });
    await openEditor();

    const background = screen.getByRole("button", { name: "Background" });
    const reviewed = screen.getByRole("button", { name: "Mark as reviewed" });
    expect(background).toHaveAttribute("aria-label", "Background");
    expect(reviewed).toHaveAttribute("aria-label", "Mark as reviewed");
    expect(background).not.toHaveTextContent("Background");
    expect(reviewed).not.toHaveTextContent("Mark as reviewed");
  });

  it("shows the full labels at 1440px and wider", async () => {
    setUpCanvas();
    setWideViewport(true);
    stubEditorApi({ boxes: [BOX] });
    await openEditor();

    await waitFor(() =>
      expect(screen.getByRole("button", { name: "Mark as reviewed" })).toHaveTextContent(
        "Mark as reviewed",
      ),
    );
    expect(screen.getByRole("button", { name: "Background" })).toHaveTextContent("Background");
  });

  it("shows the long Russian labels in full only at 1440px and wider", async () => {
    setUpCanvas();
    setWideViewport(true);
    stubEditorApi({ boxes: [BOX] });
    await openEditor("ru");

    const reviewed = await screen.findByRole("button", { name: "Отметить проверенным" });
    await waitFor(() => expect(reviewed).toHaveTextContent("Отметить проверенным"));
    expect(within(reviewed).queryByRole("img")).toBeNull();
  });

  it("keeps the Russian labels in aria-label only below 1440px", async () => {
    setUpCanvas();
    setWideViewport(false);
    stubEditorApi({ boxes: [BOX] });
    await openEditor("ru");

    const reviewed = await screen.findByRole("button", { name: "Отметить проверенным" });
    expect(reviewed).not.toHaveTextContent("Отметить проверенным");
  });
});
