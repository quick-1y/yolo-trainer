import { ActionIcon, Badge, Button, Divider, Loader, Text, Tooltip } from "@mantine/core";
import { useMediaQuery } from "@mantine/hooks";
import type { ReactNode } from "react";
import { useTranslation } from "react-i18next";
import { useSearchParams } from "react-router-dom";
import { useStore } from "zustand";

import { useNeighbors } from "../../api/images";
import { BackgroundIcon } from "./icons";
import { primaryCaps } from "./lib/shortcuts";
import { editorPath, imagesPath, readGridParams } from "./lib/urls";
import { type DocStatus, type EditorStore, type SaveState, docStatus } from "./store/annotationStore";
import { ToolTipLabel } from "./ToolBar";
import type { EditorNavigation } from "./useEditorNavigation";

/** From this viewport width on the toggle buttons show their text; below it they are icons. */
const WIDE_QUERY = "(min-width: 1440px)";

const STATUS_BADGE: Record<DocStatus, { color: string; glyph: string }> = {
  unannotated: { color: "gray", glyph: "○" },
  annotated: { color: "cyan", glyph: "●" },
  reviewed: { color: "green", glyph: "✓" },
  background: { color: "grape", glyph: "∅" },
};

/** Same 120 px slot for every state, so the bar never shifts when the state changes. */
const INDICATOR_WIDTH = 120;

function SaveIndicator({ state }: { state: SaveState }) {
  const { t } = useTranslation("editor");
  const failed = state === "error" || state === "conflict";
  const hint = t("save.errorHint");

  return (
    <Tooltip label={hint} disabled={!failed} openDelay={400}>
      <div
        role="status"
        aria-live={failed ? "polite" : "off"}
        aria-label={failed ? hint : undefined}
        style={{
          width: INDICATOR_WIDTH,
          flexShrink: 0,
          display: "flex",
          alignItems: "center",
          gap: 8,
          fontSize: 12,
          lineHeight: 1.4,
          color: failed ? "var(--mantine-color-red-4)" : "var(--mantine-color-dark-1)",
          whiteSpace: "nowrap",
        }}
      >
        {state === "saving" ? (
          <Loader size={12} color="gray" />
        ) : (
          <span
            aria-hidden
            style={{
              width: 8,
              height: 8,
              borderRadius: "50%",
              flexShrink: 0,
              background: failed ? "var(--mantine-color-red-6)" : "var(--mantine-color-green-6)",
            }}
          />
        )}
        <span>
          {state === "saved" && t("save.saved")}
          {state === "saving" && t("save.saving")}
          {failed && t("save.error")}
        </span>
      </div>
    </Tooltip>
  );
}

/** The image's status: a glyph and a word, never color alone. */
function StatusBadge({ status }: { status: DocStatus }) {
  const { t } = useTranslation("images");
  const { color, glyph } = STATUS_BADGE[status];
  const label = t(`status.${status}`);

  return (
    <Badge
      data-testid="status-badge"
      variant="light"
      size="sm"
      color={color}
      tt="none"
      aria-label={label}
      style={{ flexShrink: 0 }}
      leftSection={<span aria-hidden="true">{glyph}</span>}
    >
      {label}
    </Badge>
  );
}

interface ToggleControlProps {
  /** The full label; it is the accessible name of the icon-only form. */
  label: string;
  /** Visible text in the wide layout; defaults to `label`. */
  text?: string;
  /** Tooltip text of the wide layout; the collapsed layout shows `label`. */
  hint?: string;
  /** Why the control is disabled by the image's state; shown as the tooltip. */
  disabledHint: string;
  caps: string[];
  pressed: boolean;
  /** Disabled by the image's state (the tooltip then explains why). */
  blocked: boolean;
  /** Disabled while a move waits for the save (no explanation needed). */
  busy: boolean;
  wide: boolean;
  /** The icon of the collapsed layout, and the left section of the wide one when `wideIcon`. */
  icon: ReactNode;
  wideIcon: boolean;
  onClick: () => void;
}

/** A pressed-state toggle that is a text button at 1440px and wider and a 32 px icon button below. */
function ToggleControl({
  label,
  text,
  hint,
  disabledHint,
  caps,
  pressed,
  blocked,
  busy,
  wide,
  icon,
  wideIcon,
  onClick,
}: ToggleControlProps) {
  // The pressed state shows in the border and fill as well as in `aria-pressed`.
  const pressedStyle = pressed
    ? {
        flexShrink: 0,
        borderColor: "var(--mantine-primary-color-filled)",
        background: "var(--mantine-color-dark-5)",
      }
    : { flexShrink: 0 };
  const tip = blocked ? (
    disabledHint
  ) : (
    <ToolTipLabel label={wide ? (hint ?? label) : label} caps={caps} />
  );

  return (
    <Tooltip openDelay={400} label={tip}>
      {/* A disabled button swallows pointer events, so the Tooltip sits on a wrapper. */}
      <div style={{ flexShrink: 0, display: "flex" }}>
        {wide ? (
          <Button
            variant="default"
            size="sm"
            aria-pressed={pressed}
            disabled={blocked || busy}
            leftSection={wideIcon ? icon : undefined}
            style={pressedStyle}
            onClick={onClick}
          >
            {text ?? label}
          </Button>
        ) : (
          <ActionIcon
            variant="default"
            size={32}
            aria-label={label}
            aria-pressed={pressed}
            disabled={blocked || busy}
            style={pressedStyle}
            onClick={onClick}
          >
            {icon}
          </ActionIcon>
        )}
      </div>
    </Tooltip>
  );
}

interface EditorTopBarProps {
  projectId: number;
  imageId: number;
  filename: string;
  store: EditorStore;
  /** Every move out of the image, through the saver flush. */
  navigation: EditorNavigation;
}

/** The 48 px bar: Back, the filename, the save indicator and the previous / next arrows. */
export function EditorTopBar({
  projectId,
  imageId,
  filename,
  store,
  navigation,
}: EditorTopBarProps) {
  const { t } = useTranslation("editor");
  const [searchParams] = useSearchParams();
  const saveState = useStore(store, (state) => state.meta.saveState);
  const status = useStore(store, (state) => docStatus(state.doc));
  const hasBoxes = useStore(store, (state) => state.doc.boxes.length > 0);
  const isBackground = useStore(store, (state) => state.doc.isBackground);
  const isReviewed = useStore(store, (state) => state.doc.isReviewed);
  // Read synchronously on the first render, so the bar never flashes the wrong layout.
  const wide = useMediaQuery(WIDE_QUERY, false, { getInitialValueInEffect: false }) ?? false;
  const grid = readGridParams(searchParams);
  // The same query as the editor page's: one request, shared through the cache.
  const neighbors = useNeighbors(projectId, imageId, grid.sort, grid.q).data;
  const { goTo, pending } = navigation;
  const prevId = neighbors?.prev_id ?? null;
  const nextId = neighbors?.next_id ?? null;

  return (
    <div
      style={{
        gridColumn: "1 / -1",
        height: 48,
        display: "flex",
        alignItems: "center",
        gap: 8,
        padding: "0 16px",
        background: "var(--mantine-color-dark-7)",
        borderBottom: "1px solid var(--mantine-color-dark-4)",
        minWidth: 0,
      }}
    >
      <Button
        variant="subtle"
        size="sm"
        aria-label={t("topBar.backAria")}
        style={{ flexShrink: 0 }}
        loading={pending === "back"}
        onClick={() => void goTo(imagesPath(projectId, grid), "back")}
      >
        {`← ${t("topBar.back")}`}
      </Button>
      <Text
        size="md"
        fw={600}
        truncate="end"
        title={filename}
        style={{ maxWidth: "30%", minWidth: 120, flexShrink: 1 }}
      >
        {filename}
      </Text>
      <StatusBadge status={status} />
      <SaveIndicator state={saveState} />
      <div style={{ flex: 1 }} />
      <ToggleControl
        label={t("topBar.background.label")}
        hint={t("topBar.background.hint")}
        disabledHint={t("topBar.background.disabledHint")}
        caps={primaryCaps("background")}
        pressed={isBackground}
        blocked={hasBoxes}
        busy={pending !== null}
        wide={wide}
        icon={<BackgroundIcon />}
        wideIcon
        onClick={() => store.getState().toggleBackground()}
      />
      <ToggleControl
        label={isReviewed ? t("topBar.reviewed.on") : t("topBar.reviewed.off")}
        text={isReviewed ? `✓ ${t("topBar.reviewed.on")}` : t("topBar.reviewed.off")}
        disabledHint={t("topBar.reviewed.disabledHint")}
        caps={primaryCaps("reviewed")}
        pressed={isReviewed}
        blocked={!hasBoxes && !isBackground}
        busy={pending !== null}
        wide={wide}
        icon={<span aria-hidden="true">✓</span>}
        wideIcon={false}
        onClick={() => store.getState().toggleReviewed()}
      />
      <Divider orientation="vertical" h={24} />
      <ActionIcon
        variant="default"
        size={32}
        aria-label={t("topBar.prevAria")}
        disabled={prevId === null}
        loading={pending === "prev"}
        onClick={() => prevId !== null && void goTo(editorPath(projectId, prevId, grid), "prev")}
      >
        ‹
      </ActionIcon>
      {neighbors?.position != null && (
        <Text
          span
          size="xs"
          c="dark.1"
          style={{ fontVariantNumeric: "tabular-nums", whiteSpace: "nowrap", flexShrink: 0 }}
        >
          {t("topBar.position", { index: neighbors.position, total: neighbors.total })}
        </Text>
      )}
      <ActionIcon
        variant="default"
        size={32}
        aria-label={t("topBar.nextAria")}
        disabled={nextId === null}
        loading={pending === "next"}
        onClick={() => nextId !== null && void goTo(editorPath(projectId, nextId, grid), "next")}
      >
        ›
      </ActionIcon>
    </div>
  );
}
