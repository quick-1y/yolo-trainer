import {
  Badge,
  Button,
  CloseButton,
  Collapse,
  CopyButton,
  Group,
  Paper,
  Progress,
  ScrollArea,
  Stack,
  Text,
} from "@mantine/core";
import type { ReactNode } from "react";
import { useState } from "react";
import { useTranslation } from "react-i18next";

import type { UploadState } from "./UploadContext";

const MAX_VISIBLE_REJECTED = 100;

interface UploadPanelProps {
  state: UploadState;
  onCancel: () => void;
  onDismiss: () => void;
}

function PanelShell({ children }: { children: ReactNode }) {
  return (
    <Paper
      bg="dark.6"
      p={16}
      radius={8}
      mb={16}
      style={{ border: "1px solid var(--mantine-color-dark-4)" }}
    >
      {children}
    </Paper>
  );
}

/**
 * One light progress / summary panel: counters only while uploading, then a
 * summary with badges and a capped, collapsible list of rejected files.
 */
export function UploadPanel({ state, onCancel, onDismiss }: UploadPanelProps) {
  const { t, i18n } = useTranslation("images");
  const [opened, setOpened] = useState(false);
  const format = (value: number) => new Intl.NumberFormat(i18n.language).format(value);

  if (state.status === "idle") {
    return null;
  }

  const rejectedCount = state.rejected.length;

  if (state.status === "running") {
    const value = state.total === 0 ? 0 : (state.processed / state.total) * 100;
    return (
      <PanelShell>
        <Group justify="space-between" align="center" mb={8}>
          <Text size="sm" fw={600}>
            {t("progress.title", { done: format(state.processed), total: format(state.total) })}
          </Text>
          <Button variant="subtle" size="compact-sm" onClick={onCancel}>
            {t("progress.cancel")}
          </Button>
        </Group>
        <Progress value={value} size={8} aria-valuenow={Math.round(value)} />
        <Text size="xs" c="dark.1" mt={8}>
          {t("progress.counters", {
            added: format(state.added),
            duplicates: format(state.duplicates),
            rejected: format(rejectedCount),
          })}
        </Text>
      </PanelShell>
    );
  }

  const title =
    state.status === "cancelled"
      ? t("summary.cancelled", { done: format(state.processed), total: format(state.total) })
      : t("summary.done");
  const visible = state.rejected.slice(0, MAX_VISIBLE_REJECTED);
  const hidden = rejectedCount - visible.length;
  const copyText = state.rejected.map((entry) => `${entry.name} — ${entry.reason}`).join("\n");

  return (
    <PanelShell>
      <Group justify="space-between" align="flex-start" wrap="nowrap">
        <Stack gap={8} role="status">
          <Text size="md" fw={600}>
            {title}
          </Text>
          <Group gap={8}>
            {state.added > 0 && (
              <Badge variant="light" color="green">
                {t("summary.added", { count: state.added })}
              </Badge>
            )}
            {state.duplicates > 0 && (
              <Badge variant="light" color="gray">
                {t("summary.duplicates", { count: state.duplicates })}
              </Badge>
            )}
            {rejectedCount > 0 && (
              <Badge variant="light" color="red">
                {t("summary.rejected", { count: rejectedCount })}
              </Badge>
            )}
          </Group>
        </Stack>
        <CloseButton aria-label={t("summary.dismiss")} onClick={onDismiss} />
      </Group>
      {state.hadRequestFailures && (
        <Text size="sm" c="dark.1" mt={8}>
          {t("summary.retryHint")}
        </Text>
      )}
      {rejectedCount > 0 && (
        <Stack gap={8} mt={8}>
          <Group gap={8}>
            <Button variant="subtle" size="compact-sm" onClick={() => setOpened((o) => !o)}>
              {opened
                ? t("summary.hideRejected")
                : t("summary.showRejected", { count: rejectedCount })}
            </Button>
            <CopyButton value={copyText}>
              {({ copied, copy }) => (
                <Button variant="default" size="compact-sm" onClick={copy}>
                  {copied ? t("summary.copied") : t("summary.copy")}
                </Button>
              )}
            </CopyButton>
          </Group>
          <Collapse expanded={opened}>
            <ScrollArea.Autosize mah={240}>
              <Stack gap={4}>
                {visible.map((entry, index) => (
                  <Group
                    key={index}
                    gap={12}
                    wrap="nowrap"
                    align="flex-start"
                    data-testid="rejected-row"
                  >
                    <Text
                      size="sm"
                      truncate="end"
                      title={entry.name}
                      style={{ flex: "0 1 40%", minWidth: 0 }}
                    >
                      {entry.name}
                    </Text>
                    <Text size="sm" c="dark.1" style={{ flex: 1, minWidth: 0 }}>
                      {entry.reason}
                    </Text>
                  </Group>
                ))}
                {hidden > 0 && (
                  <Text size="sm" c="dark.1">
                    {t("summary.more", { count: hidden })}
                  </Text>
                )}
              </Stack>
            </ScrollArea.Autosize>
          </Collapse>
        </Stack>
      )}
    </PanelShell>
  );
}
