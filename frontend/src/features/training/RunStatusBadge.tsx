import { Badge, Loader } from "@mantine/core";
import type { MantineColor } from "@mantine/core";
import { useTranslation } from "react-i18next";

import type { RunStatus, RunSummary } from "../../api/training";

interface StatusLook {
  color: MantineColor;
  /** Leading text glyph; null for the running spinner. */
  glyph: string | null;
}

// Colors and glyphs are the UI-SPEC run-status table. The label is always visible, so
// color is never the only signal.
const LOOK: Record<RunStatus, StatusLook> = {
  preparing: { color: "gray", glyph: "…" },
  queued: { color: "yellow", glyph: "○" },
  running: { color: "cyan", glyph: null },
  completed: { color: "green", glyph: "✓" },
  failed: { color: "red", glyph: "×" },
  interrupted: { color: "orange", glyph: "!" },
  cancelled: { color: "gray", glyph: "–" },
};

export const STATUS_BADGE_WIDTH = 128;

interface RunStatusBadgeProps {
  run: Pick<RunSummary, "status" | "queue_position" | "epoch" | "epochs">;
}

export function RunStatusBadge({ run }: RunStatusBadgeProps) {
  const { t } = useTranslation("training");
  const look = LOOK[run.status];

  let label: string;
  if (run.status === "queued" && run.queue_position !== null) {
    label = t("status.queuedPosition", { position: run.queue_position });
  } else if (run.status === "running" && run.epoch !== null && run.epochs !== null) {
    // The extra final-validation event is never shown as epoch Y+1 (D-12).
    label = t("status.runningEpoch", {
      epoch: Math.min(run.epoch, run.epochs),
      epochs: run.epochs,
    });
  } else {
    label = t(`status.${run.status}`);
  }

  return (
    <Badge variant="light" size="sm" color={look.color} w={STATUS_BADGE_WIDTH} fz={12} tt="none">
      {look.glyph === null ? (
        <Loader
          size={12}
          color="cyan"
          aria-hidden="true"
          mr={4}
          style={{ verticalAlign: "middle" }}
        />
      ) : (
        <span aria-hidden="true" style={{ marginInlineEnd: 4 }}>
          {look.glyph}
        </span>
      )}
      {label}
    </Badge>
  );
}
