import { Alert, Button, Group, Stack, Text } from "@mantine/core";
import { useTranslation } from "react-i18next";

import { failureCategory, interimBestUrl } from "../../api/training";
import type { RunDetail } from "../../api/training";
import { RunFailureLogBody, RunFailureLogToggle, useRunFailureLog } from "./RunFailureLog";
import { NewTrainingButton, ResumeInfo, failureHintIsResumeReason, resumeReasonId } from "./ResumeInfo";

/**
 * The status card of a failed run (TRAN-11, D-16): a localized title and hint for the failure
 * category, then the original message, the resume line, an action row ("New training", log toggle)
 * and the collapsible log tail. Everything from the process (message, log) is rendered as text
 * only (T-05-10), and it is never hidden behind the category.
 */
export function FailureAlert({ run }: { run: RunDetail }) {
  const { t } = useTranslation("training");
  const log = useRunFailureLog();
  // A null or unrecognized code falls back to "unknown" instead of a blank or invented text.
  const code = failureCategory(run.error_category);
  return (
    <Alert color="red" title={<Text fz={14} fw={600}>{t(`failure.${code}.title`)}</Text>}>
      <Stack gap={8}>
        {/* For a refused checkpoint this hint is also the visible reason Resume is disabled. */}
        <Text fz={14} id={failureHintIsResumeReason(run) ? resumeReasonId(run) : undefined}>
          {t(`failure.${code}.hint`)}
        </Text>
        <Text fz={12} c="dark.1">
          {t("failure.raw")}
        </Text>
        <Text fz={14} style={{ whiteSpace: "pre-wrap", overflowWrap: "anywhere" }}>
          {run.error_message !== null && run.error_message !== ""
            ? run.error_message
            : t("run.failed.noMessage")}
        </Text>
        <ResumeInfo run={run} />
        <Group gap={8}>
          <NewTrainingButton />
          {run.interim_best ? (
            <Button
              component="a"
              variant="default"
              size="compact-sm"
              href={interimBestUrl(run.project_id, run.id)}
              download
            >
              {t("run.interim.download")}
            </Button>
          ) : null}
          <RunFailureLogToggle opened={log.opened} onToggle={log.toggle} />
        </Group>
        {run.interim_best ? (
          <Text fz={12} c="dark.1">
            {t("run.interim.note")}
          </Text>
        ) : null}
        <RunFailureLogBody log={run.log_tail} opened={log.opened} />
      </Stack>
    </Alert>
  );
}
