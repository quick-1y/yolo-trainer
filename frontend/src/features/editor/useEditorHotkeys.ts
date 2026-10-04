import { useHotkeys } from "@mantine/hooks";
import { createContext } from "react";

import { type HotkeyOptions, type ShortcutId, buildHotkeys } from "./lib/shortcuts";

export interface EditorModalGate {
  acquire: () => () => void;
}

export const EditorModalGateContext = createContext<EditorModalGate | null>(null);

export function useEditorModalOpen(_open: boolean): void {}

export function useEditorHotkeys(
  handlers: Partial<Record<ShortcutId, (event: KeyboardEvent) => void>>,
  options: HotkeyOptions,
): void {
  useHotkeys(buildHotkeys(handlers, options));
}
