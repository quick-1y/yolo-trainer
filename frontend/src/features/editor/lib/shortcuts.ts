import type { HotkeyItem } from "@mantine/hooks";

export type ShortcutGroup = "tools" | "classes" | "editing" | "navigation" | "view" | "general";

export interface ShortcutDef {
  id: string;
  group: ShortcutGroup;
  labelKey: string;
  hotkeys: string[];
  caps: string[][];
  allowRepeat: boolean;
  editing: boolean;
}

export type ShortcutId = string;

export const SHORTCUTS: readonly ShortcutDef[] = [];

export interface HotkeyOptions {
  enabled: boolean;
  readOnly: boolean;
}

export function buildHotkeys(
  _handlers: Partial<Record<ShortcutId, (event: KeyboardEvent) => void>>,
  _options: HotkeyOptions,
): HotkeyItem[] {
  return [];
}

export function capLabel(cap: string): string {
  return cap;
}
