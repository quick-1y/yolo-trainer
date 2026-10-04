import type { HotkeyItem } from "@mantine/hooks";

export type ShortcutGroup = "tools" | "classes" | "editing" | "navigation" | "view" | "general";

export interface ShortcutDef {
  id: string;
  group: ShortcutGroup;
  /** i18n key in the `editor` namespace (the on-screen reference reads it). */
  labelKey: string;
  /**
   * Mantine hotkey strings, written for `usePhysicalKeys: true`: letters as
   * lowercase letters ("v", "mod+z"), digits as digit1 to digit9, named keys as
   * "Delete" / "Escape". Never the "KeyV" form: Mantine lower-cases the whole
   * string before it strips a case-sensitive "Key" prefix, so it never matches.
   */
  hotkeys: readonly string[];
  /** Key caps per alternative, as drawn in `Kbd` ("Mod" renders as Ctrl or the Command key). */
  caps: readonly (readonly string[])[];
  /** A held key repeats the action. False for every tool switch and destructive key. */
  allowRepeat: boolean;
  /** Changes the annotation, so it is off while the editor is read-only. */
  editing: boolean;
}

/**
 * The single shortcut table: key handling and the on-screen reference (`ShortcutsModal`) both
 * read it, so the two cannot drift. Browser- and OS-owned combinations (Ctrl+W, Ctrl+T, F5,
 * Alt+Left) are never added.
 */
export const SHORTCUTS = [
  {
    id: "select",
    group: "tools",
    labelKey: "shortcuts.select",
    hotkeys: ["v"],
    caps: [["V"]],
    allowRepeat: false,
    editing: false,
  },
  {
    id: "box",
    group: "tools",
    labelKey: "shortcuts.box",
    hotkeys: ["b"],
    caps: [["B"]],
    allowRepeat: false,
    editing: false,
  },
  {
    id: "delete",
    group: "editing",
    labelKey: "shortcuts.delete",
    hotkeys: ["Delete", "Backspace"],
    caps: [["Delete"], ["Backspace"]],
    allowRepeat: false,
    editing: true,
  },
  {
    id: "undo",
    group: "editing",
    labelKey: "shortcuts.undo",
    hotkeys: ["mod+z"],
    caps: [["Mod", "Z"]],
    allowRepeat: false,
    editing: true,
  },
  {
    id: "redo",
    group: "editing",
    labelKey: "shortcuts.redo",
    // Modifiers must match exactly, so each alternative is its own entry.
    hotkeys: ["mod+shift+z", "mod+y"],
    caps: [
      ["Mod", "Shift", "Z"],
      ["Mod", "Y"],
    ],
    allowRepeat: false,
    editing: true,
  },
  {
    id: "deselect",
    group: "editing",
    labelKey: "shortcuts.deselect",
    hotkeys: ["Escape"],
    caps: [["Esc"]],
    allowRepeat: false,
    editing: false,
  },
  {
    // The digit is read from `event.code` ("Digit3" is the third class), so every layout works.
    id: "classDigit",
    group: "classes",
    labelKey: "shortcuts.classDigit",
    hotkeys: [
      "digit1",
      "digit2",
      "digit3",
      "digit4",
      "digit5",
      "digit6",
      "digit7",
      "digit8",
      "digit9",
    ],
    caps: [["1-9"]],
    allowRepeat: false,
    editing: true,
  },
  {
    // Navigation only moves between images, so it still works while the editor is read-only.
    id: "prev",
    group: "navigation",
    labelKey: "shortcuts.prev",
    hotkeys: ["a", "ArrowLeft"],
    caps: [["A"], ["←"]],
    allowRepeat: false,
    editing: false,
  },
  {
    id: "next",
    group: "navigation",
    labelKey: "shortcuts.next",
    hotkeys: ["d", "ArrowRight"],
    caps: [["D"], ["→"]],
    allowRepeat: false,
    editing: false,
  },
  {
    id: "reviewed",
    group: "editing",
    labelKey: "shortcuts.reviewed",
    hotkeys: ["r"],
    caps: [["R"]],
    allowRepeat: false,
    editing: true,
  },
  {
    id: "background",
    group: "editing",
    labelKey: "shortcuts.background",
    hotkeys: ["g"],
    caps: [["G"]],
    allowRepeat: false,
    editing: true,
  },
  {
    id: "nextUnannotated",
    group: "navigation",
    labelKey: "shortcuts.nextUnannotated",
    hotkeys: ["n"],
    caps: [["N"]],
    allowRepeat: false,
    editing: false,
  },
  {
    // Zoom and pan are wheel and mouse gestures, so only the fit key has a row to bind.
    id: "fit",
    group: "view",
    labelKey: "shortcuts.fit",
    hotkeys: ["f", "digit0"],
    caps: [["F"], ["0"]],
    allowRepeat: false,
    editing: false,
  },
  {
    // Edits save by themselves (D-09); this only skips the wait. It is bound so that
    // `preventDefault` also suppresses the browser's own "save page" dialog.
    id: "save",
    group: "general",
    labelKey: "shortcuts.save",
    hotkeys: ["mod+s"],
    caps: [["Mod", "S"]],
    allowRepeat: false,
    editing: false,
  },
  {
    // "?" is Shift+7 on the Russian layout, so the physical Shift+Slash binding alone cannot reach
    // every user: the top bar's visible "?" button opens the reference too (Pitfall 8).
    id: "help",
    group: "general",
    labelKey: "shortcuts.help",
    hotkeys: ["shift+slash"],
    caps: [["?"]],
    allowRepeat: false,
    editing: false,
  },
] as const satisfies readonly ShortcutDef[];

export interface PointerGestureDef {
  id: string;
  group: ShortcutGroup;
  /** i18n key in the `editor` namespace. */
  labelKey: string;
  /** i18n keys (in the `editor` namespace) of the gestures, shown as text instead of key caps. */
  captionKeys: readonly string[];
}

/**
 * Mouse gestures the on-screen reference lists next to the keyboard rows. They are display-only:
 * the canvas handles them itself, so they never reach `buildHotkeys`.
 */
export const POINTER_GESTURES = [
  {
    id: "zoom",
    group: "view",
    labelKey: "shortcuts.zoom",
    captionKeys: ["shortcuts.keys.wheel"],
  },
  {
    id: "pan",
    group: "view",
    labelKey: "shortcuts.pan",
    captionKeys: ["shortcuts.keys.spaceDrag", "shortcuts.keys.middleDrag"],
  },
] as const satisfies readonly PointerGestureDef[];

export type ShortcutId = (typeof SHORTCUTS)[number]["id"];

export type ShortcutHandlers = Partial<Record<ShortcutId, (event: KeyboardEvent) => void>>;

export interface HotkeyOptions {
  /** False while a modal is open: every binding is off. */
  enabled: boolean;
  /** True while the editor cannot change annotations: editing rows are off. */
  readOnly: boolean;
}

/**
 * Mantine `useHotkeys` items for the rows that have a handler. Every item is
 * bound to the physical key (so the Russian layout works) and prevents the
 * browser default (Backspace must not navigate back). A held key is ignored for
 * every row that does not allow repeat.
 */
export function buildHotkeys(handlers: ShortcutHandlers, options: HotkeyOptions): HotkeyItem[] {
  if (!options.enabled) {
    return [];
  }
  const items: HotkeyItem[] = [];
  for (const def of SHORTCUTS as readonly ShortcutDef[]) {
    const handler = handlers[def.id as ShortcutId];
    if (handler === undefined || (def.editing && options.readOnly)) {
      continue;
    }
    const guarded = (event: KeyboardEvent) => {
      if (event.repeat && !def.allowRepeat) {
        return;
      }
      handler(event);
    };
    for (const hotkey of def.hotkeys) {
      items.push([hotkey, guarded, { usePhysicalKeys: true, preventDefault: true }]);
    }
  }
  return items;
}

/** True on macOS, where "Mod" is the Command key. */
function isMac(): boolean {
  return typeof navigator !== "undefined" && navigator.platform.startsWith("Mac");
}

/** The text of one key cap: "Mod" is Ctrl, or the Command symbol on macOS. */
export function capLabel(cap: string): string {
  if (cap === "Mod") {
    return isMac() ? "⌘" : "Ctrl";
  }
  return cap;
}

/** The caps of a row's first alternative, already mapped through `capLabel`. */
export function primaryCaps(id: ShortcutId): string[] {
  const def = (SHORTCUTS as readonly ShortcutDef[]).find((row) => row.id === id);
  return (def?.caps[0] ?? []).map(capLabel);
}
