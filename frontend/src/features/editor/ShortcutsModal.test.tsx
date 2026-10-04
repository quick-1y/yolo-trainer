import { act, screen, waitFor, within } from "@testing-library/react";
import { useLocation } from "react-router-dom";
import { afterEach, describe, expect, it, vi } from "vitest";

import { AppRoutes } from "../../app/routes";
import {
  getStage,
  installPointerCaptureStubs,
  stubElementSize,
  stubImageDecoding,
} from "../../test/canvas";
import { type NeighborsFixture, stubEditorApi } from "../../test/editorApi";
import { renderWithProviders } from "../../test/render";
import { peekEditor, resetEditors } from "./store/storeRegistry";
import { resetEditorUi, useEditorUi } from "./store/editorUiStore";

const BOX_ID = "3f2b8c1e-5d4a-4e7b-9c6d-1a2b3c4d5e6f";
const BOX = { id: BOX_ID, class_id: 7, x: 0.1, y: 0.2, w: 0.5, h: 0.5 };
const MIDDLE: NeighborsFixture = { position: 2, total: 3, prev_id: 4, next_id: 6 };
const ROUTE = "/projects/1/annotate/5?sort=name&q=img";
const NEXT_ROUTE = "/projects/1/annotate/6?sort=name&q=img";

function LocationProbe() {
  const location = useLocation();
  return <output data-testid="location">{`${location.pathname}${location.search}`}</output>;
}

function currentLocation(): string {
  return screen.getByTestId("location").textContent ?? "";
}

async function openEditor(
  options: Parameters<typeof stubEditorApi>[0] = {},
  language = "en",
) {
  stubImageDecoding(300, 200);
  stubElementSize(800, 600);
  installPointerCaptureStubs();
  const api = stubEditorApi({ neighbors: MIDDLE, ...options });
  const rendered = renderWithProviders(
    <>
      <AppRoutes />
      <LocationProbe />
    </>,
    { route: ROUTE, language },
  );
  await screen.findByRole("application");
  await waitFor(() => expect(getStage().findOne("Image")).toBeTruthy());
  return { ...rendered, ...api };
}

function press(init: KeyboardEventInit): void {
  const event = new KeyboardEvent("keydown", { bubbles: true, cancelable: true, ...init });
  act(() => {
    document.body.dispatchEvent(event);
  });
}

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

const TITLE = "Keyboard shortcuts";

function referenceDialog(): Promise<HTMLElement> {
  return screen.findByRole("dialog", { name: TITLE });
}

function capsOf(row: HTMLElement): string[] {
  return Array.from(row.querySelectorAll("kbd")).map((cap) => cap.textContent ?? "");
}

/** The 17 rows of the UI-SPEC table, in group order, with the caps each one shows. */
const EXPECTED_ROWS: Array<[label: string, caps: string[]]> = [
  ["Select tool", ["V"]],
  ["Box tool", ["B"]],
  ["Choose class 1-9 (changes the class of the selected box)", ["1-9"]],
  ["Delete selected box", ["Delete", "Backspace"]],
  ["Undo", ["Ctrl", "Z"]],
  ["Redo", ["Ctrl", "Shift", "Z", "Ctrl", "Y"]],
  ["Deselect or cancel drawing", ["Esc"]],
  ["Toggle reviewed", ["R"]],
  ["Toggle background", ["G"]],
  ["Previous image", ["A", "←"]],
  ["Next image", ["D", "→"]],
  ["Next unannotated image", ["N"]],
  ["Fit image to window", ["F", "0"]],
  ["Zoom toward the cursor", []],
  ["Pan", []],
  ["Save now", ["Ctrl", "S"]],
  ["Show this reference", ["?"]],
];

afterEach(() => {
  resetEditors();
  resetEditorUi();
});

describe("opening the shortcut reference", () => {
  it("opens from the top bar '?' button", async () => {
    const { user } = await openEditor();
    expect(screen.queryByRole("dialog", { name: TITLE })).not.toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: TITLE }));

    expect(await referenceDialog()).toBeInTheDocument();
  });

  it("opens for the physical Shift+Slash key", async () => {
    await openEditor();

    press({ code: "Slash", key: "?", shiftKey: true });

    expect(await referenceDialog()).toBeInTheDocument();
  });

  it("closes with the close button", async () => {
    const { user } = await openEditor();
    await user.click(screen.getByRole("button", { name: TITLE }));
    const dialog = await referenceDialog();

    await user.click(within(dialog).getByRole("button", { name: /close/i }));

    await waitFor(() => expect(screen.queryByRole("dialog", { name: TITLE })).not.toBeInTheDocument());
  });
});

describe("shortcut reference content", () => {
  it("shows the six groups and exactly the 17 rows of the table, each with its caps", async () => {
    const { user } = await openEditor();
    await user.click(screen.getByRole("button", { name: TITLE }));
    const dialog = await referenceDialog();

    const headings = within(dialog)
      .getAllByRole("heading")
      .map((heading) => heading.textContent);
    expect(headings).toEqual([TITLE, "Tools", "Classes", "Editing", "Navigation", "View", "General"]);

    const rows = within(dialog).getAllByRole("listitem");
    expect(rows).toHaveLength(17);
    expect(rows.map((row) => within(row).getByTestId("shortcut-label").textContent)).toEqual(
      EXPECTED_ROWS.map(([label]) => label),
    );
    expect(rows.map(capsOf)).toEqual(EXPECTED_ROWS.map(([, caps]) => caps));
  });

  it("separates alternatives with a slash and shows the pointer gestures as text", async () => {
    const { user } = await openEditor();
    await user.click(screen.getByRole("button", { name: TITLE }));
    const dialog = await referenceDialog();
    const rows = within(dialog).getAllByRole("listitem");
    const rowFor = (label: string) => {
      const row = rows.find((candidate) => within(candidate).queryByText(label) !== null);
      if (row === undefined) {
        throw new Error(`No row for ${label}`);
      }
      return row;
    };

    expect(within(rowFor("Redo")).getAllByText("/")).toHaveLength(1);
    expect(within(rowFor("Zoom toward the cursor")).getByText("Mouse wheel")).toBeInTheDocument();
    const pan = rowFor("Pan");
    expect(within(pan).getByText("Space + drag")).toBeInTheDocument();
    expect(within(pan).getByText("Middle mouse drag")).toBeInTheDocument();
    expect(within(pan).getAllByText("/")).toHaveLength(1);
  });

  it("scrolls its body inside a scroll area", async () => {
    const { user } = await openEditor();
    await user.click(screen.getByRole("button", { name: TITLE }));
    const dialog = await referenceDialog();

    expect(dialog.querySelector(".mantine-ScrollArea-root")).not.toBeNull();
  });

  it("is in Russian with Latin key caps on the Russian layout", async () => {
    const { user } = await openEditor({}, "ru");

    await user.click(screen.getByRole("button", { name: "Горячие клавиши" }));
    const dialog = await screen.findByRole("dialog", { name: "Горячие клавиши" });

    const select = within(dialog)
      .getAllByRole("listitem")
      .find((row) => within(row).queryByText("Инструмент «Выбор»") !== null);
    expect(select).toBeDefined();
    expect(capsOf(select as HTMLElement)).toEqual(["V"]);
    expect(within(dialog).getByRole("heading", { name: "Инструменты" })).toBeInTheDocument();
  });

  it("draws Mod as the Command symbol on macOS", async () => {
    vi.spyOn(navigator, "platform", "get").mockReturnValue("MacIntel");
    const { user } = await openEditor();

    await user.click(screen.getByRole("button", { name: TITLE }));
    const dialog = await referenceDialog();

    const undo = within(dialog)
      .getAllByRole("listitem")
      .find((row) => within(row).queryByText("Undo") !== null);
    expect(capsOf(undo as HTMLElement)).toEqual(["⌘", "Z"]);
  });
});

describe("while the reference is open", () => {
  it("turns navigation and editing shortcuts off, and Esc closes it and turns them back on", async () => {
    const { user, puts } = await openEditor({ boxes: [BOX] });
    act(() => {
      useEditorUi.getState().select(BOX_ID);
    });
    await user.click(screen.getByRole("button", { name: TITLE }));
    await referenceDialog();

    press({ code: "KeyD", key: "d" });
    press({ code: "Delete", key: "Delete" });
    await sleep(100);

    expect(currentLocation()).toBe(ROUTE);
    expect(puts).toHaveLength(0);
    expect(peekEditor({ projectId: 1, imageId: 5 })?.store.getState().doc.boxes).toHaveLength(1);

    await user.keyboard("{Escape}");
    await waitFor(() => expect(screen.queryByRole("dialog", { name: TITLE })).not.toBeInTheDocument());

    press({ code: "Delete", key: "Delete" });
    await waitFor(() => expect(puts).toHaveLength(1));
    expect((puts[0] as { boxes: unknown[] }).boxes).toEqual([]);

    press({ code: "KeyD", key: "d" });
    await waitFor(() => expect(currentLocation()).toBe(NEXT_ROUTE));
  });
});
