import { Box, Kbd, Modal, ScrollArea, Text } from "@mantine/core";
import { Fragment, type ReactNode } from "react";
import { useTranslation } from "react-i18next";

import {
  POINTER_GESTURES,
  SHORTCUTS,
  type ShortcutDef,
  type ShortcutGroup,
  capLabel,
} from "./lib/shortcuts";
import { useEditorModalOpen } from "./useEditorHotkeys";

/** The order of the groups in the reference (row by row of its two columns). */
const GROUPS: readonly ShortcutGroup[] = [
  "tools",
  "classes",
  "editing",
  "navigation",
  "view",
  "general",
];

const ROW_MIN_HEIGHT = 40;

/** A 12 px "/" between alternatives. */
function Separator() {
  return (
    <Text span c="dark.1" style={{ fontSize: 12, lineHeight: 1 }}>
      /
    </Text>
  );
}

/** Alternatives of one row, each a sequence of key caps ("Ctrl" "Shift" "Z"), joined by "/". */
function Caps({ alternatives }: { alternatives: readonly (readonly string[])[] }) {
  return (
    <>
      {alternatives.map((caps, index) => (
        <Fragment key={caps.join("+")}>
          {index > 0 && <Separator />}
          <span style={{ display: "inline-flex", gap: 4 }}>
            {caps.map((cap, position) => (
              // Always the Latin key name, whatever the language: the caps name physical keys.
              <Kbd key={`${position}-${cap}`}>{capLabel(cap)}</Kbd>
            ))}
          </span>
        </Fragment>
      ))}
    </>
  );
}

/** One 40 px row: the action wraps on the left, the caps stay on the right. */
function Row({ label, children }: { label: string; children: ReactNode }) {
  return (
    <li
      style={{
        minHeight: ROW_MIN_HEIGHT,
        display: "flex",
        alignItems: "center",
        justifyContent: "space-between",
        gap: 12,
      }}
    >
      <Text span data-testid="shortcut-label" style={{ fontSize: 14, minWidth: 0, flex: 1 }}>
        {label}
      </Text>
      <span
        style={{
          flexShrink: 0,
          display: "inline-flex",
          alignItems: "center",
          justifyContent: "flex-end",
          flexWrap: "wrap",
          gap: 8,
        }}
      >
        {children}
      </span>
    </li>
  );
}

interface ShortcutsModalProps {
  opened: boolean;
  onClose: () => void;
}

/**
 * The on-screen shortcut reference (ANNO-08). It is generated from `SHORTCUTS` (the table the
 * key handlers read) and `POINTER_GESTURES`, so it cannot list a binding that does not exist or
 * miss one that does. While it is open every editor shortcut is off (Pitfall 10).
 */
export function ShortcutsModal({ opened, onClose }: ShortcutsModalProps) {
  const { t } = useTranslation("editor");
  useEditorModalOpen(opened);

  return (
    <Modal
      opened={opened}
      onClose={onClose}
      title={t("shortcuts.title")}
      size={640}
      centered
      closeButtonProps={{ "aria-label": t("shortcuts.close") }}
      styles={{ title: { fontSize: 16, fontWeight: 600 } }}
    >
      <ScrollArea.Autosize mah="calc(100dvh - 200px)" type="auto">
        <Box
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(2, minmax(0, 1fr))",
            columnGap: 32,
            rowGap: 16,
          }}
        >
          {GROUPS.map((group) => (
            <section key={group}>
              <Text component="h3" m={0} style={{ fontSize: 14, fontWeight: 600 }}>
                {t(`shortcuts.group.${group}`)}
              </Text>
              <ul style={{ listStyle: "none", margin: 0, padding: 0 }}>
                {(SHORTCUTS as readonly ShortcutDef[])
                  .filter((def) => def.group === group)
                  .map((def) => (
                    <Row key={def.id} label={t(def.labelKey)}>
                      <Caps alternatives={def.caps} />
                    </Row>
                  ))}
                {POINTER_GESTURES.filter((gesture) => gesture.group === group).map((gesture) => (
                  <Row key={gesture.id} label={t(gesture.labelKey)}>
                    {gesture.captionKeys.map((key, index) => (
                      <Fragment key={key}>
                        {index > 0 && <Separator />}
                        <Text span style={{ fontSize: 14 }}>
                          {t(key)}
                        </Text>
                      </Fragment>
                    ))}
                  </Row>
                ))}
              </ul>
            </section>
          ))}
        </Box>
      </ScrollArea.Autosize>
    </Modal>
  );
}
