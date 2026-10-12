import { Button, Text } from "@mantine/core";
import { useTranslation } from "react-i18next";
import { Link } from "react-router-dom";

import { failureCategory } from "../../api/training";
import type { RunDetail } from "../../api/training";

const TABULAR = { fontVariantNumeric: "tabular-nums" } as const;

/** The id of the visible text that says why Resume is disabled (aria-describedby target). */
export function resumeReasonId(run: Pick<RunDetail, "id">): string {
  return `resume-reason-${run.id}`;
}

/**
 * True when a failed run's own failure hint already is the visible reason for a refused
 * checkpoint, so no separate resume line repeats it (D-10; no new copy for `not_resumable`).
 */
export function failureHintIsResumeReason(run: RunDetail): boolean {
  return (
    run.status === "failed" &&
    run.resume_blocked === "not_resumable" &&
    failureCategory(run.error_category) === "not_resumable"
  );
}

/** What the disabled Resume button points at; undefined when it is enabled or has no reason. */
export function resumeDescribedBy(run: RunDetail): string | undefined {
  return !run.can_resume && run.resume_blocked !== null ? resumeReasonId(run) : undefined;
}

/**
 * The shared lines of an interrupted, cancelled or failed run: the last completed epoch, then
 * what Resume will do or why it cannot (D-10, D-11). With an unknown checkpoint epoch the line
 * names none, because no epoch is presented as certain before the worker confirms it.
 */
export function ResumeInfo({ run }: { run: RunDetail }) {
  const { t } = useTranslation("training");
  const id = resumeReasonId(run);
  const blocked = run.resume_blocked;

  let line: { key: string; values?: Record<string, number>; withId: boolean } | null = null;
  if (run.can_resume) {
    line =
      run.resume_epoch !== null
        ? { key: "run.resume.hint", values: { epoch: run.resume_epoch + 1 }, withId: false }
        : { key: "run.resume.hintUnknown", withId: false };
  } else if (blocked === "no_checkpoint" || blocked === "finished") {
    line = { key: `run.resume.blocked.${blocked}`, withId: true };
  } else if (blocked === "not_resumable" && !failureHintIsResumeReason(run)) {
    line = { key: "failure.not_resumable.hint", withId: true };
  }

  return (
    <>
      {run.epoch !== null ? (
        <Text size="sm" style={TABULAR}>
          {t("run.reached", { epoch: run.epoch, epochs: run.epochs ?? run.settings.epochs })}
        </Text>
      ) : null}
      {line !== null ? (
        <Text size="sm" id={line.withId ? id : undefined}>
          {t(line.key, line.values)}
        </Text>
      ) : null}
    </>
  );
}

/** "New training" next to the resume line: a plain link to the start form. */
export function NewTrainingButton() {
  const { t } = useTranslation("training");
  return (
    <Button variant="default" size="compact-sm" component={Link} to="../new" relative="path">
      {t("page.new")}
    </Button>
  );
}
