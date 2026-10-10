import { act, screen, waitFor, within } from "@testing-library/react";
import { VirtuosoMockContext } from "react-virtuoso";
import { afterEach, describe, expect, it, vi } from "vitest";

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
import { CAR_CLASS, type NeighborsFixture, stubEditorApi } from "../../test/editorApi";
import { renderWithProviders } from "../../test/render";
import { resetEditorUi } from "./store/editorUiStore";
import { resetEditors } from "./store/storeRegistry";

const MIDDLE: NeighborsFixture = { position: 2, total: 3, prev_id: 4, next_id: 6 };
const BOX = {
  id: "3f2b8c1e-5d4a-4e7b-9c6d-1a2b3c4d5e6f",
  class_id: 7,
  x: 0.1,
  y: 0.2,
  w: 0.5,
  h: 0.5,
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

async function openEditor(
  options: Parameters<typeof stubEditorApi>[0] = {},
  { wide = false, language = "en" }: { wide?: boolean; language?: string } = {},
) {
  setWideViewport(wide);
  stubImageDecoding(300, 200);
  stubElementSize(800, 600);
  installPointerCaptureStubs();
  const api = stubEditorApi(options);
  const rendered = renderWithProviders(
    <VirtuosoMockContext.Provider value={{ viewportHeight: 400, itemHeight: 40 }}>
      <AppRoutes />
    </VirtuosoMockContext.Provider>,
    { route: "/projects/1/annotate/5", language },
  );
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

function press(init: KeyboardEventInit): void {
  const event = new KeyboardEvent("keydown", { bubbles: true, cancelable: true, ...init });
  act(() => {
    document.body.dispatchEvent(event);
  });
}

/** The split trigger: its accessible name is "Split: <value>" in both layouts. */
const splitButton = (name: RegExp | string = /^(Split|Выборка): /) =>
  screen.getByRole("button", { name });

afterEach(() => {
  window.matchMedia = realMatchMedia;
  resetEditors();
  resetEditorUi();
});

describe("editor split menu layout", () => {
  it("shows 'Split: No split' at 1440 px and wider for an unassigned image", async () => {
    await openEditor({}, { wide: true });

    const button = await screen.findByRole("button", { name: "Split: No split" });
    expect(button).toHaveTextContent(/^Split: No split/);
  });

  it("shows the value alone below 1440 px, in a fixed 104 px trigger named 'Split: No split'", async () => {
    await openEditor();

    const button = await screen.findByRole("button", { name: "Split: No split" });
    expect(button).toHaveTextContent(/^No split/);
    expect(button).not.toHaveTextContent("Split:");
    expect(button.getAttribute("style") ?? "").toMatch(/width: calc\(6\.5rem/);
  });

  it("fits 'Валидация' in the fixed narrow trigger in Russian", async () => {
    await openEditor({ split: "valid" }, { language: "ru" });

    const button = await screen.findByRole("button", { name: "Выборка: Валидация" });
    expect(button).toHaveTextContent(/^Валидация/);
    expect(button.getAttribute("style") ?? "").toMatch(/width: calc\(6\.5rem/);
  });

  it("marks the current value with a check in the menu", async () => {
    const { user } = await openEditor({ split: "test" }, { wide: true });

    await user.click(await screen.findByRole("button", { name: "Split: Test" }));

    const items = await screen.findAllByRole("menuitem");
    expect(items.map((item) => item.textContent)).toEqual(["Train", "Valid", "Test✓", "No split"]);
  });
});

describe("changing the split in the editor", () => {
  it("calls the split route, not the annotation saver, and leaves the save state and status alone", async () => {
    const { user, puts, splitPosts } = await openEditor({}, { wide: true });
    const badgeBefore = screen.getByTestId("status-badge").textContent;

    await user.click(await screen.findByRole("button", { name: "Split: No split" }));
    await user.click(await screen.findByRole("menuitem", { name: "Train" }));

    await waitFor(() => expect(splitPosts).toEqual([{ ids: [5], split: "train" }]));
    expect(await screen.findByRole("button", { name: "Split: Train" })).toHaveTextContent(
      "Split: Train",
    );
    expect(puts).toHaveLength(0);
    expect(screen.getByText("Saved")).toBeInTheDocument();
    expect(screen.getByTestId("status-badge").textContent).toBe(badgeBefore);
    await user.click(screen.getByRole("button", { name: "Split: Train" }));
    const items = await screen.findAllByRole("menuitem");
    expect(items.map((item) => item.textContent)).toEqual(["Train✓", "Valid", "Test", "No split"]);
  });

  it("returns an image to no split with null", async () => {
    const { user, splitPosts } = await openEditor({ split: "valid" }, { wide: true });

    await user.click(await screen.findByRole("button", { name: "Split: Valid" }));
    await user.click(await screen.findByRole("menuitem", { name: "No split" }));

    await waitFor(() => expect(splitPosts).toEqual([{ ids: [5], split: null }]));
    expect(await screen.findByRole("button", { name: "Split: No split" })).toBeInTheDocument();
  });

  it("keeps a reviewed image reviewed and sends no save", async () => {
    const { user, puts, splitPosts } = await openEditor(
      { boxes: [BOX], isReviewed: true },
      { wide: true },
    );
    const reviewed = screen.getByRole("button", { name: /^(✓ )?Reviewed$/ });
    expect(reviewed).toHaveAttribute("aria-pressed", "true");

    await user.click(await screen.findByRole("button", { name: "Split: No split" }));
    await user.click(await screen.findByRole("menuitem", { name: "Test" }));

    await waitFor(() => expect(splitPosts).toHaveLength(1));
    await screen.findByRole("button", { name: "Split: Test" });
    expect(screen.getByRole("button", { name: /^(✓ )?Reviewed$/ })).toHaveAttribute(
      "aria-pressed",
      "true",
    );
    expect(screen.getByTestId("status-badge")).toHaveTextContent("Reviewed");
    expect(puts).toHaveLength(0);
  });

  it("shows a red notification with the API message and keeps the old value on failure", async () => {
    const { user, splitPosts } = await openEditor(
      { split: "train", splitError: "Database is busy." },
      { wide: true },
    );

    await user.click(await screen.findByRole("button", { name: "Split: Train" }));
    await user.click(await screen.findByRole("menuitem", { name: "Valid" }));

    await waitFor(() => expect(splitPosts).toHaveLength(1));
    await waitFor(() =>
      expect(notifications.show).toHaveBeenCalledWith({ color: "red", message: "Database is busy." }),
    );
    expect(screen.getByRole("button", { name: "Split: Train" })).toBeInTheDocument();
  });

  it("has no keyboard shortcut", async () => {
    const { splitPosts } = await openEditor({}, { wide: true });
    await screen.findByRole("button", { name: "Split: No split" });

    for (const key of ["t", "v", "s", "x"]) {
      press({ code: `Key${key.toUpperCase()}`, key });
    }

    expect(splitPosts).toHaveLength(0);
    expect(screen.getByRole("button", { name: "Split: No split" })).toBeEnabled();
  });
});

describe("editor split menu availability", () => {
  it("is disabled while a navigation waits for the save flush", async () => {
    const { setPutMode, releasePuts, puts } = await openEditor(
      { neighbors: MIDDLE, classes: [CAR_CLASS] },
      { wide: true },
    );
    setPutMode("hold");
    await screen.findByText("2 of 3");
    drag([100, 100], [400, 300]);

    press({ code: "KeyD", key: "d" });
    await waitFor(() => expect(puts).toHaveLength(1));

    await waitFor(() => expect(splitButton()).toBeDisabled());
    releasePuts();
  });

  it("stays enabled in the conflict read-only state and still changes the split", async () => {
    const { user, splitPosts } = await openEditor(
      { putMode: "conflict", classes: [CAR_CLASS], neighbors: MIDDLE },
      { wide: true },
    );
    await screen.findByText("2 of 3");
    drag([100, 100], [400, 300]);
    const banner = await screen.findByRole("alert");
    expect(within(banner).getByRole("button", { name: "Reload" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Box" })).toBeDisabled();

    expect(splitButton()).toBeEnabled();
    await user.click(splitButton());
    await user.click(await screen.findByRole("menuitem", { name: "Valid" }));

    await waitFor(() => expect(splitPosts).toEqual([{ ids: [5], split: "valid" }]));
  });
});
