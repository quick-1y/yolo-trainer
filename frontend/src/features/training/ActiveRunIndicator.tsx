import { Anchor, Loader } from "@mantine/core";
import { useTranslation } from "react-i18next";
import { Link } from "react-router-dom";

import type { ActiveRun } from "../../api/training";
import { activeRunPath, useActiveRun } from "../../api/training";

export type ActiveRunIndicatorVariant = "header" | "editor";

interface ActiveRunIndicatorProps {
  variant: ActiveRunIndicatorVariant;
}

const PILL_HEIGHT = 32;

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
export function ActiveRunIndicator({ variant }: ActiveRunIndicatorProps) {
  const { data } = useActiveRun();

  if (!isActiveRun(data) || variant !== "header") {
    return null;
  }
  return <HeaderIndicator run={data} />;
}

function HeaderIndicator({ run }: { run: ActiveRun }) {
  const { t } = useTranslation("training");
  const label =
    run.epoch === null
      ? t("indicator.starting", { project: run.project_name, run: run.run_name })
      : t("indicator.full", {
          project: run.project_name,
          run: run.run_name,
          epoch: run.epoch,
          epochs: run.epochs,
        });

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
