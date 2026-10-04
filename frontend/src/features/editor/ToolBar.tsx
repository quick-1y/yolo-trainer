import { ActionIcon, Group, Kbd, Stack, Tooltip } from "@mantine/core";
import type { ReactNode } from "react";
import { useTranslation } from "react-i18next";

import { BoxIcon, SelectIcon } from "./icons";
import { type EditorTool, useEditorUi } from "./store/editorUiStore";

interface ToolButtonProps {
  tool: EditorTool;
  label: string;
  shortcut: string;
  icon: ReactNode;
  /** Tooltip text when disabled; the label and shortcut are shown otherwise. */
  disabledHint?: string;
  disabled?: boolean;
}

function ToolButton({ tool, label, shortcut, icon, disabledHint, disabled }: ToolButtonProps) {
  const active = useEditorUi((state) => state.tool === tool);
  const setTool = useEditorUi((state) => state.setTool);
  const showHint = disabled === true && disabledHint !== undefined;

  return (
    <Tooltip
      openDelay={400}
      position="right"
      label={
        showHint ? (
          disabledHint
        ) : (
          <Group gap={8} wrap="nowrap">
            <span>{label}</span>
            <Kbd size="xs">{shortcut}</Kbd>
          </Group>
        )
      }
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

interface ToolBarProps {
  /** The project has at least one class. */
  hasClasses: boolean;
  /** The original has decoded. */
  imageLoaded: boolean;
}

/** The 48 px vertical tool bar: Select (V) and Box (B). */
export function ToolBar({ hasClasses, imageLoaded }: ToolBarProps) {
  const { t } = useTranslation("editor");

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
          shortcut="V"
          icon={<SelectIcon />}
        />
        <ToolButton
          tool="box"
          label={t("tools.box")}
          shortcut="B"
          icon={<BoxIcon />}
          disabled={!hasClasses || !imageLoaded}
          disabledHint={hasClasses ? undefined : t("tools.boxDisabled")}
        />
      </Stack>
    </div>
  );
}
