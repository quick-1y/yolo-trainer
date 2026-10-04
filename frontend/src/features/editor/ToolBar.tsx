import { ActionIcon, Divider, Group, Kbd, Stack, Tooltip } from "@mantine/core";
import type { ReactNode } from "react";
import { useTranslation } from "react-i18next";
import { useStore } from "zustand";

import { BoxIcon, RedoIcon, SelectIcon, UndoIcon } from "./icons";
import { primaryCaps } from "./lib/shortcuts";
import { type EditorTool, useEditorUi } from "./store/editorUiStore";
import type { EditorStore } from "./store/annotationStore";

interface ToolTipLabelProps {
  label: string;
  /** Key caps of the shortcut, drawn as one `Kbd` each. */
  caps: string[];
}

export function ToolTipLabel({ label, caps }: ToolTipLabelProps) {
  return (
    <Group gap={8} wrap="nowrap">
      <span>{label}</span>
      {caps.length > 0 && (
        <Group gap={2} wrap="nowrap">
          {caps.map((cap) => (
            <Kbd key={cap} size="xs">
              {cap}
            </Kbd>
          ))}
        </Group>
      )}
    </Group>
  );
}

interface ToolButtonProps {
  tool: EditorTool;
  label: string;
  caps: string[];
  icon: ReactNode;
  /** Tooltip text when disabled; the label and shortcut are shown otherwise. */
  disabledHint?: string;
  disabled?: boolean;
}

function ToolButton({ tool, label, caps, icon, disabledHint, disabled }: ToolButtonProps) {
  const active = useEditorUi((state) => state.tool === tool);
  const setTool = useEditorUi((state) => state.setTool);
  const showHint = disabled === true && disabledHint !== undefined;

  return (
    <Tooltip
      openDelay={400}
      position="right"
      label={showHint ? disabledHint : <ToolTipLabel label={label} caps={caps} />}
    >
      {/* A disabled button swallows pointer events, so the Tooltip sits on a wrapper. */}
      <div style={{ width: 40, height: 40 }}>
        <ActionIcon
          size={40}
          radius={8}
          variant={active ? "filled" : "subtle"}
          color={active ? undefined : "gray"}
          aria-label={label}
          aria-pressed={active}
          disabled={disabled}
          onClick={() => setTool(tool)}
        >
          {icon}
        </ActionIcon>
      </div>
    </Tooltip>
  );
}

interface HistoryButtonProps {
  label: string;
  caps: string[];
  icon: ReactNode;
  disabled: boolean;
  onClick: () => void;
}

/** Undo / Redo: plain action buttons (not toggles), disabled when the stack is empty. */
function HistoryButton({ label, caps, icon, disabled, onClick }: HistoryButtonProps) {
  return (
    <Tooltip
      openDelay={400}
      position="right"
      label={<ToolTipLabel label={label} caps={caps} />}
      disabled={disabled}
    >
      <div style={{ width: 40, height: 40 }}>
        <ActionIcon
          size={40}
          radius={8}
          variant="subtle"
          color="gray"
          aria-label={label}
          disabled={disabled}
          onClick={onClick}
        >
          {icon}
        </ActionIcon>
      </div>
    </Tooltip>
  );
}

interface ToolBarProps {
  /** The current image's store; its temporal history drives Undo and Redo. */
  store: EditorStore;
  /** The project has at least one class. */
  hasClasses: boolean;
  /** The original has decoded. */
  imageLoaded: boolean;
}

/** The 48 px vertical tool bar: Select (V), Box (B), a divider, Undo and Redo. */
export function ToolBar({ store, hasClasses, imageLoaded }: ToolBarProps) {
  const { t } = useTranslation("editor");
  const pastCount = useStore(store.temporal, (state) => state.pastStates.length);
  const futureCount = useStore(store.temporal, (state) => state.futureStates.length);

  return (
    <div
      role="toolbar"
      aria-orientation="vertical"
      aria-label={t("tools.aria")}
      style={{
        padding: 4,
        minWidth: 0,
        minHeight: 0,
        background: "var(--mantine-color-dark-7)",
        borderRight: "1px solid var(--mantine-color-dark-4)",
      }}
    >
      <Stack gap={8} align="center">
        <ToolButton
          tool="select"
          label={t("tools.select")}
          caps={primaryCaps("select")}
          icon={<SelectIcon />}
        />
        <ToolButton
          tool="box"
          label={t("tools.box")}
          caps={primaryCaps("box")}
          icon={<BoxIcon />}
          disabled={!hasClasses || !imageLoaded}
          disabledHint={hasClasses ? undefined : t("tools.boxDisabled")}
        />
        <Divider w={24} />
        <HistoryButton
          label={t("tools.undo")}
          caps={primaryCaps("undo")}
          icon={<UndoIcon />}
          disabled={pastCount === 0}
          onClick={() => store.temporal.getState().undo()}
        />
        <HistoryButton
          label={t("tools.redo")}
          caps={primaryCaps("redo")}
          icon={<RedoIcon />}
          disabled={futureCount === 0}
          onClick={() => store.temporal.getState().redo()}
        />
      </Stack>
    </div>
  );
}
