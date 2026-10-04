import { ActionIcon, Box, Button, Divider, EmptyState, Select, Skeleton, Stack, Text } from "@mantine/core";
import { memo, useMemo } from "react";
import { useTranslation } from "react-i18next";
import { Virtuoso } from "react-virtuoso";
import { useStore } from "zustand";
import { useShallow } from "zustand/react/shallow";

import type { Box as AnnotationBox } from "../../api/annotations";
import type { ProjectClassItem } from "../../api/classes";
import classes from "./ClassPanel.module.css";
import { EyeIcon, EyeOffIcon } from "./icons";
import type { EditorStore } from "./store/annotationStore";
import { useEditorUi } from "./store/editorUiStore";

const ROW_HEIGHT = 40;

interface SelectOption {
  value: string;
  label: string;
}

interface ObjectRowProps {
  box: AnnotationBox;
  /** 1-based position in annotation order. */
  ordinal: number;
  color: string;
  options: SelectOption[];
  store: EditorStore;
  onReleaseFocus: () => void;
}

const ObjectRow = memo(function ObjectRow({
  box,
  ordinal,
  color,
  options,
  store,
  onReleaseFocus,
}: ObjectRowProps) {
  const { t } = useTranslation("editor");
  const selected = useEditorUi((state) => state.selectedId === box.id);
  const hovered = useEditorUi((state) => state.hoveredId === box.id);
  const hidden = useEditorUi((state) => state.hiddenIds.has(box.id));

  // A row click selects the box and never toggles it off. A selection only exists
  // in the Select tool, so the tool follows.
  const handleSelect = () => {
    const ui = useEditorUi.getState();
    ui.setTool("select");
    ui.select(box.id);
  };

  return (
    <div
      data-testid="object-row"
      className={classes.row}
      data-active={selected ? "true" : undefined}
      data-hovered={hovered ? "true" : undefined}
      style={{ opacity: hidden ? 0.5 : 1, cursor: "pointer" }}
      onClick={handleSelect}
      onMouseEnter={() => useEditorUi.getState().hover(box.id)}
      onMouseLeave={() => useEditorUi.getState().hover(null)}
    >
      <Text
        component="span"
        size="xs"
        data-testid="object-ordinal"
        style={{ width: 16, flexShrink: 0, fontVariantNumeric: "tabular-nums" }}
      >
        {ordinal}
      </Text>
      <ActionIcon
        size={32}
        variant="subtle"
        color="gray"
        aria-pressed={hidden}
        aria-label={t(hidden ? "objects.showAria" : "objects.hideAria", { index: ordinal })}
        onClick={(event) => {
          event.stopPropagation();
          useEditorUi.getState().toggleHidden(box.id);
        }}
      >
        {hidden ? <EyeOffIcon /> : <EyeIcon />}
      </ActionIcon>
      <span className={classes.swatch} style={{ background: color }} />
      {/* The dropdown renders in a portal but its clicks still bubble through React: keep them off the row. */}
      <div style={{ flex: 1, minWidth: 0 }} onClick={(event) => event.stopPropagation()}>
        <Select
          size="xs"
          aria-label={t("objects.classAria", { index: ordinal })}
          data={options}
          value={String(box.class_id)}
          searchable={false}
          allowDeselect={false}
          comboboxProps={{ withinPortal: true }}
          title={options.find((option) => option.value === String(box.class_id))?.label}
          renderOption={({ option }) => (
            <Text size="xs" truncate="end" title={option.label} style={{ minWidth: 0 }}>
              {option.label}
            </Text>
          )}
          onChange={(value) => {
            if (value === null) {
              return;
            }
            store.getState().setBoxClass(box.id, Number(value));
            // The Select keeps focus in its input, which makes every shortcut ignore the
            // keyboard (Pitfall 9): let go of it and hand the focus back to the canvas.
            if (document.activeElement instanceof HTMLElement) {
              document.activeElement.blur();
            }
            onReleaseFocus();
          }}
        />
      </div>
      <ActionIcon
        size={32}
        variant="subtle"
        color="red"
        aria-label={t("objects.deleteAria", { index: ordinal })}
        onClick={(event) => {
          event.stopPropagation();
          store.getState().deleteBox(box.id);
        }}
      >
        <span aria-hidden="true">×</span>
      </ActionIcon>
    </div>
  );
});

interface ObjectListProps {
  /** The open image's store; null until the annotation set is loaded. */
  store: EditorStore | null;
  /** Undefined while the classes load. */
  classes: ProjectClassItem[] | undefined;
  /** Called after a class was chosen in a row, to hand the keyboard back to the editor. */
  onReleaseFocus: () => void;
}

function SkeletonRows() {
  return (
    <Stack gap={0}>
      {[0, 1, 2].map((slot) => (
        <Skeleton key={slot} height={ROW_HEIGHT} radius={6} />
      ))}
    </Stack>
  );
}

/** The boxes of the open image in annotation order, only the visible rows mounted. */
function Rows({
  store,
  classItems,
  onReleaseFocus,
}: {
  store: EditorStore;
  classItems: ProjectClassItem[];
  onReleaseFocus: () => void;
}) {
  const { t } = useTranslation("editor");
  const boxes = useStore(
    store,
    useShallow((state) => state.doc.boxes),
  );
  const isBackground = useStore(store, (state) => state.doc.isBackground);
  const options = useMemo(
    () => classItems.map((item) => ({ value: String(item.id), label: item.name })),
    [classItems],
  );
  const colors = useMemo(
    () => Object.fromEntries(classItems.map((item) => [item.id, item.color])),
    [classItems],
  );

  return (
    <>
      <Text size="sm" fw={600}>
        {t("objects.title", { count: boxes.length })}
      </Text>
      {isBackground ? (
        // A background image has no boxes by rule (D-14): the body replaces the rows.
        <Stack gap={8} align="flex-start" py={16}>
          <Text size="sm" c="dark.1">
            {t("objects.background.body")}
          </Text>
          <Button
            size="compact-sm"
            variant="subtle"
            onClick={() => store.getState().toggleBackground()}
          >
            {t("objects.background.clear")}
          </Button>
        </Stack>
      ) : boxes.length === 0 ? (
        <EmptyState
          title={t("objects.empty.title")}
          description={t("objects.empty.body")}
          py={48}
        />
      ) : (
        <Box style={{ flex: 1, minHeight: 0 }}>
          <Virtuoso
            style={{ height: "100%" }}
            data={boxes}
            fixedItemHeight={ROW_HEIGHT}
            computeItemKey={(_index, box) => box.id}
            itemContent={(index, box) => (
              <ObjectRow
                box={box}
                ordinal={index + 1}
                color={colors[box.class_id] ?? "#FFFFFF"}
                options={options}
                store={store}
                onReleaseFocus={onReleaseFocus}
              />
            )}
          />
        </Box>
      )}
    </>
  );
}

const NO_CLASSES: ProjectClassItem[] = [];

/**
 * The lower part of the editor's right column: every object of the image, with a
 * visibility toggle, a class dropdown and delete. Rows are virtualized 40px rows.
 */
export function ObjectList({ store, classes: classItems, onReleaseFocus }: ObjectListProps) {
  return (
    <Box style={{ flex: 1, minHeight: 0, display: "flex", flexDirection: "column" }}>
      <Divider color="dark.4" />
      <Stack
        gap={8}
        px={16}
        pb={16}
        pt={24}
        style={{ flex: 1, minHeight: 0, display: "flex", flexDirection: "column" }}
      >
        {store === null ? (
          <SkeletonRows />
        ) : (
          <Rows
            store={store}
            classItems={classItems ?? NO_CLASSES}
            onReleaseFocus={onReleaseFocus}
          />
        )}
      </Stack>
    </Box>
  );
}
