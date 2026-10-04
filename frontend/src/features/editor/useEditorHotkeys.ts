import { useHotkeys } from "@mantine/hooks";
import { createContext, useContext, useEffect } from "react";

import { type HotkeyOptions, type ShortcutHandlers, buildHotkeys } from "./lib/shortcuts";

/**
 * Counts the editor's open modals. `EditorPage` provides it and turns every
 * shortcut off while the count is above zero (Pitfall 10); a dialog opts in
 * with `useEditorModalOpen(opened)`.
 */
export interface EditorModalGate {
  /** Register one open modal; the returned function releases it. */
  acquire: () => () => void;
}

export const EditorModalGateContext = createContext<EditorModalGate | null>(null);

/** Hold the modal gate for as long as `open` is true (and until unmount). */
export function useEditorModalOpen(open: boolean): void {
  const gate = useContext(EditorModalGateContext);
  useEffect(() => {
    if (!open || gate === null) {
      return undefined;
    }
    return gate.acquire();
  }, [open, gate]);
}

/**
 * Bind the editor's shortcuts to the physical keys (see `lib/shortcuts.ts`).
 * Mantine ignores key presses inside INPUT, TEXTAREA and SELECT by default.
 */
export function useEditorHotkeys(handlers: ShortcutHandlers, options: HotkeyOptions): void {
  useHotkeys(buildHotkeys(handlers, options));
}
