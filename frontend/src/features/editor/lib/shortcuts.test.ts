import { act, renderHook } from "@testing-library/react";
import { type ReactNode, createElement } from "react";
import { type Mock, afterEach, describe, expect, it, vi } from "vitest";

import {
  EditorModalGateContext,
  type EditorModalGate,
  useEditorHotkeys,
  useEditorModalOpen,
} from "../useEditorHotkeys";
import { SHORTCUTS, buildHotkeys, capLabel, type ShortcutId } from "./shortcuts";

type Handlers = Partial<Record<ShortcutId, (event: KeyboardEvent) => void>>;

type Spy = Mock<(event: KeyboardEvent) => void>;
type Spies = Record<ShortcutId, Spy>;

function spy(): Spy {
  return vi.fn<(event: KeyboardEvent) => void>();
}

function allHandlers(): Spies {
  return {
    select: spy(),
    box: spy(),
    delete: spy(),
    undo: spy(),
    redo: spy(),
    deselect: spy(),
    classDigit: spy(),
    prev: spy(),
    next: spy(),
  };
}

function press(init: KeyboardEventInit, target: Element = document.documentElement): KeyboardEvent {
  const event = new KeyboardEvent("keydown", { bubbles: true, cancelable: true, ...init });
  act(() => {
    target.dispatchEvent(event);
  });
  return event;
}

function mount(handlers: Handlers, options = { enabled: true, readOnly: false }) {
  return renderHook(() => useEditorHotkeys(handlers, options));
}

function calledIds(handlers: Spies): string[] {
  return Object.entries(handlers)
    .filter(([, handler]) => handler.mock.calls.length > 0)
    .map(([id]) => id);
}

afterEach(() => {
  document.body.innerHTML = "";
});

describe("buildHotkeys", () => {
  it("returns nothing when shortcuts are disabled", () => {
    expect(buildHotkeys(allHandlers(), { enabled: false, readOnly: false })).toEqual([]);
  });

  it("drops delete, undo and redo when read-only but keeps select and deselect", () => {
    const keys = buildHotkeys(allHandlers(), { enabled: true, readOnly: true }).map(
      ([hotkey]) => hotkey,
    );

    expect(keys).toContain("v");
    expect(keys).toContain("Escape");
    for (const gone of ["Delete", "Backspace", "mod+z", "mod+shift+z", "mod+y"]) {
      expect(keys).not.toContain(gone);
    }
  });

  it("skips rows that have no handler", () => {
    const keys = buildHotkeys({ select: spy() }, { enabled: true, readOnly: false }).map(
      ([hotkey]) => hotkey,
    );

    expect(keys).toEqual(["v"]);
  });

  it("binds every row by physical key", () => {
    const items = buildHotkeys(allHandlers(), { enabled: true, readOnly: false });

    expect(items.length).toBeGreaterThan(0);
    for (const [, , options] of items) {
      expect(options).toMatchObject({ usePhysicalKeys: true, preventDefault: true });
    }
  });

  it("never writes a letter in the KeyX form that Mantine lower-cases into a dead key", () => {
    for (const def of SHORTCUTS) {
      for (const hotkey of def.hotkeys) {
        expect(hotkey).not.toMatch(/Key[A-Z]/);
      }
    }
  });

  it("has one row per documented action in the tools and editing groups", () => {
    expect(SHORTCUTS.map((def) => def.id)).toEqual([
      "select",
      "box",
      "delete",
      "undo",
      "redo",
      "deselect",
      "classDigit",
      "prev",
      "next",
    ]);
    expect(SHORTCUTS.filter((def) => def.editing).map((def) => def.id)).toEqual([
      "delete",
      "undo",
      "redo",
      "classDigit",
    ]);
  });

  it("binds the digits 1-9 to physical keys in one classes row", () => {
    const row = SHORTCUTS.find((def) => def.id === "classDigit");
    expect(row?.group).toBe("classes");
    expect(row?.hotkeys).toEqual([
      "digit1",
      "digit2",
      "digit3",
      "digit4",
      "digit5",
      "digit6",
      "digit7",
      "digit8",
      "digit9",
    ]);
  });
});

describe("navigation rows", () => {
  it("binds A and the left arrow to prev, D and the right arrow to next, in the navigation group", () => {
    const prev = SHORTCUTS.find((def) => def.id === "prev");
    const next = SHORTCUTS.find((def) => def.id === "next");

    expect(prev?.group).toBe("navigation");
    expect(prev?.hotkeys).toEqual(["a", "ArrowLeft"]);
    expect(next?.group).toBe("navigation");
    expect(next?.hotkeys).toEqual(["d", "ArrowRight"]);
  });

  it("does not repeat and stays available in read-only states", () => {
    for (const id of ["prev", "next"]) {
      const row = SHORTCUTS.find((def) => def.id === id);
      expect(row?.allowRepeat).toBe(false);
      expect(row?.editing).toBe(false);
    }
  });

  it("maps D and the right arrow to next only, also on the Russian layout", () => {
    const handlers = allHandlers();
    mount(handlers);

    press({ code: "KeyD", key: "в" });
    press({ code: "ArrowRight", key: "ArrowRight" });

    expect(handlers.next).toHaveBeenCalledTimes(2);
    expect(calledIds(handlers)).toEqual(["next"]);
  });

  it("ignores a held navigation key", () => {
    const handlers = allHandlers();
    mount(handlers);

    press({ code: "KeyA", key: "a", repeat: true });
    press({ code: "ArrowLeft", key: "ArrowLeft", repeat: true });

    expect(calledIds(handlers)).toEqual([]);
  });
});

describe("capLabel", () => {
  it("shows Mod as Ctrl off macOS and leaves other caps alone", () => {
    expect(capLabel("Mod")).toBe("Ctrl");
    expect(capLabel("Shift")).toBe("Shift");
    expect(capLabel("Z")).toBe("Z");
  });
});

describe("useEditorHotkeys", () => {
  it("selects the Select tool for the V key on the Russian layout (key reports a different letter)", () => {
    const handlers = allHandlers();
    mount(handlers);

    press({ code: "KeyV", key: "м" });

    expect(calledIds(handlers)).toEqual(["select"]);
  });

  it("maps B to the Box tool", () => {
    const handlers = allHandlers();
    mount(handlers);

    press({ code: "KeyB", key: "и" });

    expect(calledIds(handlers)).toEqual(["box"]);
  });

  it("maps a digit key to classDigit with the physical code, also on a layout where key differs", () => {
    const handlers = allHandlers();
    mount(handlers);

    press({ code: "Digit3", key: "№" });

    expect(calledIds(handlers)).toEqual(["classDigit"]);
    expect(handlers.classDigit.mock.calls[0][0].code).toBe("Digit3");
  });

  it("ignores a held digit, Ctrl+digit and the numpad digits", () => {
    const handlers = allHandlers();
    mount(handlers);

    press({ code: "Digit3", key: "3", repeat: true });
    press({ code: "Digit3", key: "3", ctrlKey: true });
    press({ code: "Numpad3", key: "3" });

    expect(calledIds(handlers)).toEqual([]);
  });

  it("turns the digits off while the editor is read-only", () => {
    const handlers = allHandlers();
    mount(handlers, { enabled: true, readOnly: true });

    press({ code: "Digit1", key: "1" });

    expect(calledIds(handlers)).toEqual([]);
  });

  it("maps Ctrl+Z to undo only", () => {
    const handlers = allHandlers();
    mount(handlers);

    press({ code: "KeyZ", key: "я", ctrlKey: true });

    expect(calledIds(handlers)).toEqual(["undo"]);
  });

  it("maps Ctrl+Shift+Z to redo only", () => {
    const handlers = allHandlers();
    mount(handlers);

    press({ code: "KeyZ", key: "Я", ctrlKey: true, shiftKey: true });

    expect(calledIds(handlers)).toEqual(["redo"]);
  });

  it("maps Ctrl+Y to redo", () => {
    const handlers = allHandlers();
    mount(handlers);

    press({ code: "KeyY", key: "н", ctrlKey: true });

    expect(calledIds(handlers)).toEqual(["redo"]);
  });

  it("treats the Command key like Ctrl", () => {
    const handlers = allHandlers();
    mount(handlers);

    press({ code: "KeyZ", key: "z", metaKey: true });

    expect(calledIds(handlers)).toEqual(["undo"]);
  });

  it("maps Delete and Backspace to delete and Escape to deselect", () => {
    const handlers = allHandlers();
    mount(handlers);

    press({ code: "Delete", key: "Delete" });
    press({ code: "Backspace", key: "Backspace" });
    press({ code: "Escape", key: "Escape" });

    expect(handlers.delete).toHaveBeenCalledTimes(2);
    expect(handlers.deselect).toHaveBeenCalledTimes(1);
  });

  it("ignores a held key: a repeating Delete calls nothing", () => {
    const handlers = allHandlers();
    mount(handlers);

    press({ code: "Delete", key: "Delete", repeat: true });

    expect(calledIds(handlers)).toEqual([]);
  });

  it("ignores a held tool key and a held undo", () => {
    const handlers = allHandlers();
    mount(handlers);

    press({ code: "KeyV", key: "v", repeat: true });
    press({ code: "KeyZ", key: "z", ctrlKey: true, repeat: true });

    expect(calledIds(handlers)).toEqual([]);
  });

  it("handles each distinct press once", () => {
    const handlers = allHandlers();
    mount(handlers);

    press({ code: "Delete", key: "Delete" });
    press({ code: "Delete", key: "Delete", repeat: true });
    press({ code: "Delete", key: "Delete", repeat: true });

    expect(handlers.delete).toHaveBeenCalledTimes(1);
  });

  it("prevents the default of Backspace so the browser never navigates back", () => {
    mount(allHandlers());

    const event = press({ code: "Backspace", key: "Backspace" });

    expect(event.defaultPrevented).toBe(true);
  });

  it("ignores keys typed into an input", () => {
    const handlers = allHandlers();
    mount(handlers);
    const input = document.createElement("input");
    document.body.appendChild(input);

    const event = press({ code: "Backspace", key: "Backspace" }, input);
    press({ code: "KeyV", key: "v" }, input);
    press({ code: "KeyZ", key: "z", ctrlKey: true }, input);

    expect(calledIds(handlers)).toEqual([]);
    expect(event.defaultPrevented).toBe(false);
  });

  it("ignores keys inside a textarea and a select", () => {
    const handlers = allHandlers();
    mount(handlers);
    const textarea = document.createElement("textarea");
    const select = document.createElement("select");
    document.body.append(textarea, select);

    press({ code: "KeyB", key: "b" }, textarea);
    press({ code: "KeyB", key: "b" }, select);

    expect(calledIds(handlers)).toEqual([]);
  });

  it("does nothing while disabled", () => {
    const handlers = allHandlers();
    mount(handlers, { enabled: false, readOnly: false });

    press({ code: "KeyV", key: "v" });
    press({ code: "Delete", key: "Delete" });

    expect(calledIds(handlers)).toEqual([]);
  });

  it("keeps select working but blocks editing keys when read-only", () => {
    const handlers = allHandlers();
    mount(handlers, { enabled: true, readOnly: true });

    press({ code: "KeyV", key: "v" });
    press({ code: "Delete", key: "Delete" });
    press({ code: "KeyZ", key: "z", ctrlKey: true });

    expect(calledIds(handlers)).toEqual(["select"]);
  });

  it("does not react to modified letters such as Alt+V", () => {
    const handlers = allHandlers();
    mount(handlers);

    press({ code: "KeyV", key: "v", altKey: true });
    press({ code: "KeyV", key: "V", ctrlKey: true });

    expect(calledIds(handlers)).toEqual([]);
  });
});

describe("useEditorModalOpen", () => {
  function gateWrapper(gate: EditorModalGate) {
    return ({ children }: { children: ReactNode }) =>
      createElement(EditorModalGateContext.Provider, { value: gate }, children);
  }

  it("holds the gate while a modal is open and releases it on close and unmount", () => {
    const release = vi.fn();
    const gate: EditorModalGate = { acquire: vi.fn(() => release) };
    const { rerender, unmount } = renderHook(({ open }) => useEditorModalOpen(open), {
      initialProps: { open: false },
      wrapper: gateWrapper(gate),
    });
    expect(gate.acquire).not.toHaveBeenCalled();

    rerender({ open: true });
    expect(gate.acquire).toHaveBeenCalledTimes(1);
    expect(release).not.toHaveBeenCalled();

    rerender({ open: false });
    expect(release).toHaveBeenCalledTimes(1);

    rerender({ open: true });
    unmount();
    expect(gate.acquire).toHaveBeenCalledTimes(2);
    expect(release).toHaveBeenCalledTimes(2);
  });

  it("is harmless without a provider", () => {
    expect(() => renderHook(() => useEditorModalOpen(true))).not.toThrow();
  });
});
