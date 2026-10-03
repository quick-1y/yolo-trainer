import {
  Box,
  Button,
  ColorPicker,
  Group,
  Popover,
  Text,
  TextInput,
  UnstyledButton,
} from "@mantine/core";
import { notifications } from "@mantine/notifications";
import { useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";

import { useUpdateClass } from "../../api/classes";
import type { ProjectClassItem } from "../../api/classes";
import { ApiError } from "../../api/client";
import { CLASS_PALETTE } from "../../lib/classPalette";
import { DeleteClassModal } from "./DeleteClassModal";

interface ClassRowProps {
  item: ProjectClassItem;
  projectId: number;
  /** True when other classes come after this one (shown in the delete dialog). */
  hasLaterClasses: boolean;
  /** The first row has no top border (the header row already draws one). */
  isFirst?: boolean;
}

function errorMessage(error: unknown): string {
  return error instanceof ApiError ? error.message : String(error);
}

// 48px row: index (12px, tabular) · color swatch button · name (one line,
// ellipsis, native title with the full name) · Rename. The swatch background
// only ever receives a server-validated `#RRGGBB` value (or one the picker
// itself produced, which the server re-validates before storing).
export function ClassRow({
  item,
  projectId,
  hasLaterClasses,
  isFirst = false,
}: ClassRowProps) {
  const { t } = useTranslation(["classes", "common"]);
  const rename = useUpdateClass(projectId);
  const recolor = useUpdateClass(projectId);

  // --- rename -------------------------------------------------------------
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(item.name);
  const [renameError, setRenameError] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  // Blur fires when the input is disabled/unmounted after Enter or Esc; these
  // refs keep that follow-up blur from saving a second time or after a cancel.
  const finishedRef = useRef(false);

  useEffect(() => {
    if (editing) {
      inputRef.current?.focus();
      inputRef.current?.select();
    }
  }, [editing]);

  function startEditing() {
    finishedRef.current = false;
    setDraft(item.name);
    setRenameError(null);
    rename.reset();
    setEditing(true);
  }

  function cancelEditing() {
    finishedRef.current = true;
    setRenameError(null);
    setEditing(false);
  }

  function saveRename(source: "enter" | "blur") {
    if (finishedRef.current || rename.isPending) {
      return;
    }
    const trimmed = draft.trim();
    if (trimmed === "") {
      // An emptied input never saves: Enter keeps editing, blur gives up.
      if (source === "blur") {
        cancelEditing();
      }
      return;
    }
    if (trimmed === item.name) {
      cancelEditing();
      return;
    }
    if (source === "blur" && renameError !== null) {
      // The rejected value is still in the input; do not resend it on blur.
      return;
    }
    rename.mutate(
      { id: item.id, name: trimmed },
      {
        onSuccess: () => {
          finishedRef.current = true;
          setRenameError(null);
          setEditing(false);
        },
        onError: (error) => setRenameError(errorMessage(error)),
      },
    );
  }

  // --- delete -------------------------------------------------------------
  const [deleteOpened, setDeleteOpened] = useState(false);

  // --- recolor ------------------------------------------------------------
  // The swatch shows the chosen color at once; the server answer (or a revert
  // on failure) replaces it. null = show the stored color.
  const [pendingColor, setPendingColor] = useState<string | null>(null);
  const shownColor = pendingColor ?? item.color;

  function commitColor(value: string) {
    const next = value.toUpperCase();
    if (next === item.color.toUpperCase()) {
      setPendingColor(null);
      return;
    }
    setPendingColor(next);
    recolor.mutate(
      { id: item.id, color: next },
      {
        onSuccess: () => setPendingColor(null),
        onError: (error) => {
          setPendingColor(null);
          notifications.show({ color: "red", message: errorMessage(error) });
        },
      },
    );
  }

  return (
    <Box
      data-testid="class-row"
      style={{
        display: "flex",
        alignItems: "center",
        gap: 8,
        height: 48,
        padding: "0 16px",
        borderTop: isFirst
          ? undefined
          : "1px solid var(--mantine-color-dark-4)",
      }}
    >
      <Text
        data-testid="class-index"
        size="xs"
        style={{ width: 48, flexShrink: 0, fontVariantNumeric: "tabular-nums" }}
      >
        {item.index}
      </Text>
      <Popover position="bottom-start" shadow="md" withArrow={false}>
        <Popover.Target>
          <UnstyledButton
            data-testid="class-swatch"
            aria-label={t("classes:row.changeColor", { name: item.name })}
            style={{
              width: 24,
              height: 24,
              flexShrink: 0,
              borderRadius: 4,
              background: shownColor,
              border: "1px solid rgba(255, 255, 255, 0.24)",
            }}
          />
        </Popover.Target>
        <Popover.Dropdown>
          <ColorPicker
            format="hex"
            value={shownColor}
            onChange={setPendingColor}
            onChangeEnd={commitColor}
            swatches={[...CLASS_PALETTE]}
            swatchesPerRow={6}
          />
          <Text
            size="xs"
            c="dark.1"
            mt={8}
            style={{ fontVariantNumeric: "tabular-nums" }}
          >
            {shownColor.toUpperCase()}
          </Text>
        </Popover.Dropdown>
      </Popover>
      <Box style={{ flex: 1, minWidth: 0 }}>
        {editing ? (
          <TextInput
            ref={inputRef}
            size="sm"
            maxLength={100}
            value={draft}
            error={renameError}
            disabled={rename.isPending}
            aria-label={t("classes:row.rename")}
            onChange={(event) => {
              setDraft(event.currentTarget.value);
              setRenameError(null);
            }}
            onKeyDown={(event) => {
              if (event.key === "Enter") {
                event.preventDefault();
                saveRename("enter");
              } else if (event.key === "Escape") {
                event.preventDefault();
                cancelEditing();
              }
            }}
            onBlur={() => saveRename("blur")}
          />
        ) : (
          <Text size="md" title={item.name} truncate="end">
            {item.name}
          </Text>
        )}
      </Box>
      <Group gap={4} wrap="nowrap" style={{ flexShrink: 0 }}>
        <Button
          variant="subtle"
          size="compact-sm"
          onClick={startEditing}
          disabled={editing}
        >
          {t("classes:row.rename")}
        </Button>
        <Button
          variant="light"
          color="red"
          size="compact-sm"
          onClick={() => setDeleteOpened(true)}
        >
          {t("classes:row.delete")}
        </Button>
      </Group>
      <DeleteClassModal
        opened={deleteOpened}
        onClose={() => setDeleteOpened(false)}
        projectId={projectId}
        projectClass={item}
        hasLaterClasses={hasLaterClasses}
      />
    </Box>
  );
}
