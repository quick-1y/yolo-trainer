import {
  Alert,
  Box,
  Button,
  Collapse,
  EmptyState,
  Group,
  Kbd,
  ScrollArea,
  Skeleton,
  Stack,
  Text,
  UnstyledButton,
} from "@mantine/core";
import { useState } from "react";
import { useTranslation } from "react-i18next";

import { ApiError } from "../../api/client";
import type { ProjectClassItem } from "../../api/classes";
import { AddClassForm } from "../classes/AddClassForm";
import classes from "./ClassPanel.module.css";
import { useEditorUi } from "./store/editorUiStore";

/** Only the first nine classes have a digit key. */
const DIGIT_CLASSES = 9;

interface ClassRowProps {
  item: ProjectClassItem;
  index: number;
  active: boolean;
  /** Boxes of this class on the open image. */
  count: number;
  onChoose: (index: number) => void;
}

function ClassRow({ item, index, active, count, onChoose }: ClassRowProps) {
  const { t } = useTranslation("editor");
  return (
    <UnstyledButton
      className={classes.row}
      aria-pressed={active}
      data-active={active || undefined}
      onClick={() => onChoose(index)}
    >
      <span className={classes.digit}>
        {index < DIGIT_CLASSES && <Kbd size="xs">{index + 1}</Kbd>}
      </span>
      <span className={classes.swatch} style={{ background: item.color }} />
      <Text size="sm" truncate="end" className={classes.name} title={item.name}>
        {item.name}
      </Text>
      <Text
        component="span"
        size="xs"
        c="dark.1"
        className={classes.count}
        aria-label={t("classPanel.countOnImageAria", { name: item.name, count })}
      >
        {count}
      </Text>
    </UnstyledButton>
  );
}

interface ClassPanelProps {
  projectId: number;
  /** Undefined while the classes load or when loading failed. */
  items: ProjectClassItem[] | undefined;
  /** The classes request failed and there is nothing to show. */
  error: unknown;
  onRetry: () => void;
  /** The class new boxes get (already falls back to the first class). */
  activeClassId: number | undefined;
  /** Boxes per class id on the open image. */
  counts: Record<number, number>;
  /** A box is selected: a row click changes its class instead of the active class. */
  hasSelection: boolean;
  /** A row was clicked or a digit key pressed; the owner decides what it means. */
  onChoose: (index: number) => void;
}

/**
 * The top of the editor's right column: the project's classes, the active one
 * marked, a digit hint on the first nine, and inline creation (D-05, D-06, D-07).
 */
export function ClassPanel({
  projectId,
  items,
  error,
  onRetry,
  activeClassId,
  counts,
  hasSelection,
  onChoose,
}: ClassPanelProps) {
  const { t } = useTranslation(["editor", "common"]);
  const setActiveClass = useEditorUi((state) => state.setActiveClass);
  const [formOpen, setFormOpen] = useState(false);

  // The first class of a project becomes the class to draw with at once (D-07).
  const handleCreated = (created: ProjectClassItem) => {
    if (items !== undefined && items.length === 0) {
      setActiveClass(created.id);
    }
  };

  let body;
  if (items === undefined && error) {
    body = (
      <Alert color="red" title={t("common:error.title")} p="xs">
        <Stack gap={8} align="flex-start">
          <Text size="sm">{error instanceof ApiError ? error.message : String(error)}</Text>
          <Button size="compact-sm" variant="light" color="red" onClick={onRetry}>
            {t("common:retry")}
          </Button>
        </Stack>
      </Alert>
    );
  } else if (items === undefined) {
    body = (
      <Stack gap={0}>
        {[0, 1, 2].map((slot) => (
          <Skeleton key={slot} height={40} radius={6} />
        ))}
      </Stack>
    );
  } else if (items.length === 0) {
    body = (
      <Stack gap={16}>
        <EmptyState
          title={t("classPanel.empty.title")}
          description={t("classPanel.empty.body")}
          py={16}
        />
        <AddClassForm projectId={projectId} onCreated={handleCreated} />
      </Stack>
    );
  } else {
    body = (
      <>
        <ScrollArea.Autosize mah="max(120px, calc((100dvh - 48px) * 0.4))" type="auto">
          <Stack gap={0}>
            {items.map((item, index) => (
              <ClassRow
                key={item.id}
                item={item}
                index={index}
                active={item.id === activeClassId}
                count={counts[item.id] ?? 0}
                onChoose={onChoose}
              />
            ))}
          </Stack>
        </ScrollArea.Autosize>
        <Box>
          <Button
            variant="subtle"
            color="gray"
            size="compact-sm"
            leftSection={<span aria-hidden="true">+</span>}
            aria-expanded={formOpen}
            onClick={() => setFormOpen((open) => !open)}
          >
            {t("classPanel.add")}
          </Button>
          <Collapse expanded={formOpen}>
            <Box pt={8}>
              <AddClassForm projectId={projectId} onCreated={handleCreated} />
            </Box>
          </Collapse>
        </Box>
      </>
    );
  }

  return (
    <Stack data-testid="class-panel" gap={8} p={16} style={{ flexShrink: 0, minHeight: 0 }}>
      <Group justify="space-between" wrap="nowrap">
        <Text size="sm" fw={600}>
          {t("classPanel.title")}
        </Text>
        {items !== undefined && (
          <Text size="xs" c="dark.1">
            {t("classPanel.count", { count: items.length })}
          </Text>
        )}
      </Group>
      {/* A reserved line, so the rows below do not jump when a box gets selected. */}
      <Box h={16}>
        {hasSelection && items !== undefined && items.length > 0 && (
          <Text size="xs" c="dark.1" lh="16px">
            {t("classPanel.hintChange")}
          </Text>
        )}
      </Box>
      {body}
    </Stack>
  );
}
