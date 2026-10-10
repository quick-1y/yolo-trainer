import { Anchor, Loader, Tooltip } from "@mantine/core";
import { useMediaQuery } from "@mantine/hooks";
import type { MouseEvent } from "react";
import { useTranslation } from "react-i18next";
import { Link } from "react-router-dom";

import type { ActiveRun } from "../../api/training";
import { activeRunPath, useActiveRun } from "../../api/training";

export type ActiveRunIndicatorVariant = "header" | "editor";

interface ActiveRunIndicatorProps {
  variant: ActiveRunIndicatorVariant;
  /**
   * Editor variant: called with the run page path for a plain left click, so the editor can save
   * before it leaves. Other clicks (Ctrl/Cmd/Shift/Alt, middle button) are left to the browser.
   */
  onNavigate?: (path: string) => void;
}

const PILL_HEIGHT = 32;
/** The editor top bar switches to its wide layout here (the same value as EditorTopBar's). */
const WIDE_QUERY = "(min-width: 1440px)";
/** Fixed boxes of the editor form, so the indicator never shifts the other top bar items. */
const EDITOR_WIDE_WIDTH = 72;
const EDITOR_NARROW_WIDTH = 32;

function isActiveRun(value: unknown): value is ActiveRun {
  return (
    typeof value === "object" &&
    value !== null &&
    typeof (value as { run_id?: unknown }).run_id === "number"
  );
}

/**
 * Shows the run that is training right now (D-14). It renders nothing while no run is running,
 * before the first response and when a poll fails: the run page stays the source of truth.
 */
export function ActiveRunIndicator({ variant, onNavigate }: ActiveRunIndicatorProps) {
  const { data } = useActiveRun();

  if (!isActiveRun(data)) {
    return null;
  }
  return variant === "header" ? (
    <HeaderIndicator run={data} />
  ) : (
    <EditorIndicator run={data} onNavigate={onNavigate} />
  );
}

/** The full sentence: project, run and epoch (or "starting" before the first epoch). */
function useRunLabel(run: ActiveRun): string {
  const { t } = useTranslation("training");
  return run.epoch === null
    ? t("indicator.starting", { project: run.project_name, run: run.run_name })
    : t("indicator.full", {
        project: run.project_name,
        run: run.run_name,
        epoch: run.epoch,
        epochs: run.epochs,
      });
}

function HeaderIndicator({ run }: { run: ActiveRun }) {
  const label = useRunLabel(run);

  return (
    <Anchor
      component={Link}
      to={activeRunPath(run)}
      underline="never"
      title={label}
      aria-label={label}
      aria-live="off"
      c="inherit"
      fz={14}
      fw={400}
      style={{
        display: "inline-flex",
        alignItems: "center",
        gap: 8,
        height: PILL_HEIGHT,
        padding: "0 16px",
        borderRadius: 8,
        background: "var(--mantine-color-dark-6)",
        maxWidth: 420,
        minWidth: 0,
      }}
    >
      <Loader size={12} color="gray" style={{ flexShrink: 0 }} />
      <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
        {label}
      </span>
    </Anchor>
  );
}

/** A click the app handles itself; anything else (new tab, new window, download) is the browser's. */
function isPlainPrimaryClick(event: MouseEvent): boolean {
  return event.button === 0 && !event.ctrlKey && !event.metaKey && !event.shiftKey && !event.altKey;
}

/**
 * The compact form for the full-screen editor top bar: icon only below 1440 px, a short
 * "12/100" at 1440 px and wider, both in a fixed box. Names never show here, only in the
 * tooltip and the accessible name.
 */
function EditorIndicator({
  run,
  onNavigate,
}: {
  run: ActiveRun;
  onNavigate?: (path: string) => void;
}) {
  const { t } = useTranslation("training");
  const label = useRunLabel(run);
  const wide = useMediaQuery(WIDE_QUERY, false, { getInitialValueInEffect: false }) ?? false;
  const path = activeRunPath(run);

  return (
    <Tooltip label={label} openDelay={400}>
      <a
        href={path}
        aria-label={label}
        aria-live="off"
        className="mantine-focus-auto"
        onClick={(event) => {
          if (onNavigate !== undefined && isPlainPrimaryClick(event)) {
            event.preventDefault();
            onNavigate(path);
          }
        }}
        style={{
          display: "inline-flex",
          alignItems: "center",
          justifyContent: "center",
          gap: 4,
          flexShrink: 0,
          boxSizing: "border-box",
          width: wide ? EDITOR_WIDE_WIDTH : EDITOR_NARROW_WIDTH,
          height: PILL_HEIGHT,
          padding: wide ? "0 8px" : 0,
          borderRadius: 8,
          background: "var(--mantine-color-dark-6)",
          color: "inherit",
          textDecoration: "none",
          overflow: "hidden",
          fontSize: 12,
          fontVariantNumeric: "tabular-nums",
          whiteSpace: "nowrap",
        }}
      >
        <Loader size={wide ? 12 : 16} color="gray" style={{ flexShrink: 0 }} />
        {wide && run.epoch !== null ? (
          <span>{t("indicator.short", { epoch: run.epoch, epochs: run.epochs })}</span>
        ) : null}
      </a>
    </Tooltip>
  );
}
