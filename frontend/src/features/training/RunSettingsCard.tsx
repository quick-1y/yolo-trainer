import { Box, Paper, Stack, Text } from "@mantine/core";
import type { ReactNode } from "react";
import { useTranslation } from "react-i18next";

import type { RunDetail } from "../../api/training";
import { formatRelativeTime } from "../../lib/relativeTime";

interface Row {
  key: string;
  label: string;
  value: ReactNode;
}

/** `cpu` -> "CPU", a GPU index -> "GPU 0"; used for both the chosen and the resolved device. */
function deviceName(device: string): string {
  return device === "cpu" ? "CPU" : `GPU ${device}`;
}

/** The frozen settings and dataset of a run (TRAN-03, D-12). */
export function RunSettingsCard({ run }: { run: RunDetail }) {
  const { t, i18n } = useTranslation(["training", "projects"]);
  const { settings, resolved } = run;

  const absolute = new Intl.DateTimeFormat(i18n.language, { dateStyle: "medium", timeStyle: "short" });
  const time = (iso: string | null): ReactNode =>
    iso === null ? null : <span title={absolute.format(new Date(iso))}>{formatRelativeTime(iso, i18n.language)}</span>;

  const batch =
    settings.batch === -1
      ? resolved !== null
        ? t("training:settings.auto", { value: resolved.batch })
        : t("training:settings.autoPending")
      : String(settings.batch);
  const device =
    settings.device === "auto"
      ? resolved !== null
        ? t("training:settings.auto", { value: deviceName(resolved.device) })
        : t("training:settings.autoPending")
      : deviceName(settings.device);
  const classes = run.class_names !== null && run.class_names.length > 0 ? run.class_names.join(", ") : null;

  const rows: Row[] = [
    { key: "base", label: t("training:settings.base"), value: run.base_name },
    { key: "epochs", label: t("training:settings.epochs"), value: String(settings.epochs) },
    { key: "imgsz", label: t("training:settings.imgsz"), value: String(settings.imgsz) },
    { key: "batch", label: t("training:settings.batch"), value: batch },
    { key: "device", label: t("training:settings.device"), value: device },
    { key: "task", label: t("training:settings.task"), value: t(`projects:taskType.${run.task_type}`) },
    {
      key: "dataset",
      label: t("training:settings.dataset"),
      value:
        run.dataset_counts === null
          ? null
          : t("training:settings.dataset_counts", {
              train: run.dataset_counts.train,
              valid: run.dataset_counts.valid,
              test: run.dataset_counts.test,
            }),
    },
    {
      key: "classes",
      label: t("training:settings.classes"),
      value:
        classes === null ? null : (
          <Text component="span" fz={14} lineClamp={2} title={classes}>
            {classes}
          </Text>
        ),
    },
    { key: "created", label: t("training:settings.created"), value: time(run.created_at) },
    { key: "started", label: t("training:settings.started"), value: time(run.started_at) },
    { key: "finished", label: t("training:settings.finished"), value: time(run.finished_at) },
  ];

  return (
    <Paper
      p={16}
      radius={8}
      style={{ background: "var(--mantine-color-dark-6)" }}
      data-testid="run-settings"
    >
      <Stack gap={16}>
        <Text fz={14} fw={600}>
          {t("training:settings.title")}
        </Text>
        <Box
          component="dl"
          m={0}
          style={{
            display: "grid",
            gridTemplateColumns: "160px 1fr",
            rowGap: 8,
            columnGap: 16,
          }}
        >
          {rows
            .filter((row) => row.value !== null)
            .map((row) => (
              <RowPair key={row.key} label={row.label} value={row.value} />
            ))}
        </Box>
      </Stack>
    </Paper>
  );
}

function RowPair({ label, value }: { label: string; value: ReactNode }) {
  return (
    <>
      <Text component="dt" fz={12} c="dark.1">
        {label}
      </Text>
      <Text component="dd" fz={14} m={0} style={{ minWidth: 0, overflowWrap: "anywhere" }}>
        {value}
      </Text>
    </>
  );
}
