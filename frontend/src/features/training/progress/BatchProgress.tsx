import { Group, Progress, Stack, Text } from "@mantine/core";
import { useTranslation } from "react-i18next";

import type { BatchState } from "./foldProgress";

const TABULAR = { fontVariantNumeric: "tabular-nums" } as const;

interface BatchProgressProps {
  batch: BatchState;
  /** The latest mAP50, already formatted ("—" before the first value). */
  map50: string;
}

/**
 * The neutral in-epoch bar: "Batch N of M" for the epoch that is running. It is deliberately not
 * the accent color, so it never reads as a second epoch bar (UI-SPEC "Color"), and it does not
 * animate: at each new epoch it simply restarts at 0.
 */
export function BatchProgress({ batch, map50 }: BatchProgressProps) {
  const { t } = useTranslation("training");
  const label = t("run.running.batch", { batch: batch.batch, total: batch.nb });

  return (
    <Stack gap={4}>
      <Progress.Root
        size={4}
        role="progressbar"
        aria-label={label}
        aria-valuemin={0}
        aria-valuemax={batch.nb}
        aria-valuenow={batch.batch}
        aria-live="off"
        styles={{
          root: { backgroundColor: "var(--mantine-color-dark-4)" },
          section: { transition: "none" },
        }}
      >
        <Progress.Section
          value={(batch.batch / batch.nb) * 100}
          color="dark.1"
          withAria={false}
        />
      </Progress.Root>
      <Group justify="space-between" wrap="nowrap">
        <Text size="xs" c="dark.1" style={TABULAR}>
          {label}
        </Text>
        <Text size="xs" c="dark.1" style={TABULAR}>
          {t("run.running.map50", { value: map50 })}
        </Text>
      </Group>
    </Stack>
  );
}
