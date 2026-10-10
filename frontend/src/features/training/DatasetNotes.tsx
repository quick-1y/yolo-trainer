import { Alert, Anchor, Stack, Text } from "@mantine/core";
import { useTranslation } from "react-i18next";
import { Link } from "react-router-dom";

import type { TrainingNote } from "../../api/training";

/** How many class names a "no examples" warning lists before "…and N more". */
const MAX_LISTED_NAMES = 3;

interface DatasetNotesProps {
  projectId: number;
  /** Reasons Start is disabled. */
  blockers: TrainingNote[];
  /** Non-blocking remarks. */
  warnings: TrainingNote[];
  /**
   * Images without a split. The split link is offered only when there are some; when left
   * out, the server's own "images without a split" warning decides.
   */
  unassigned?: number;
  /** Open the auto-split dialog. */
  onAutoSplit: () => void;
}

/**
 * The blockers and warnings above the Start button (D-04, D-05). Blockers sit in one yellow
 * alert with an inline fix link; warnings in a second one. Each alert is hidden when empty.
 */
export function DatasetNotes({
  projectId,
  blockers,
  warnings,
  unassigned,
  onAutoSplit,
}: DatasetNotesProps) {
  const { t } = useTranslation("training");
  const hasUnassigned =
    unassigned !== undefined
      ? unassigned > 0
      : warnings.some((note) => note.code === "unassigned" && note.count > 0);

  function blockerLine(note: TrainingNote) {
    switch (note.code) {
      case "noClasses":
        return (
          <>
            {t("notes.blocker.noClasses")}{" "}
            <Anchor component={Link} to={`/projects/${projectId}/classes`} size="sm">
              {t("notes.blocker.noClassesLink")}
            </Anchor>
          </>
        );
      case "trainEmpty":
      case "validEmpty":
        return (
          <>
            {t(`notes.blocker.${note.code}`)}
            {hasUnassigned ? (
              <>
                {" "}
                <Anchor component="button" type="button" size="sm" onClick={onAutoSplit}>
                  {t("summary.autoSplit")}
                </Anchor>
              </>
            ) : null}
          </>
        );
      default:
        return t(`notes.blocker.${note.code}`, { defaultValue: note.code });
    }
  }

  function warningLine(note: TrainingNote): string {
    switch (note.code) {
      case "unannotated":
      case "unassigned":
        return t(`notes.warning.${note.code}`, { count: note.count });
      case "classesMissingTrain":
      case "classesMissingValid": {
        const listed = note.names.slice(0, MAX_LISTED_NAMES).join(", ");
        const rest = note.names.length - MAX_LISTED_NAMES;
        const names = rest > 0 ? `${listed} ${t("notes.more", { count: rest })}` : listed;
        return t(`notes.warning.${note.code}`, { names });
      }
      case "workerStale":
        return t("newRun.worker.stale");
      default:
        return note.code;
    }
  }

  if (blockers.length === 0 && warnings.length === 0) {
    return null;
  }

  return (
    <Stack gap={8}>
      {blockers.length > 0 ? (
        <Alert color="yellow" title={t("newRun.cannotStart.title")} data-testid="notes-blockers">
          <Stack gap={4}>
            {blockers.map((note) => (
              <Text key={note.code} size="sm" style={{ overflowWrap: "anywhere" }}>
                {blockerLine(note)}
              </Text>
            ))}
          </Stack>
        </Alert>
      ) : null}
      {warnings.length > 0 ? (
        <Alert color="yellow" variant="light" data-testid="notes-warnings">
          <Stack gap={4}>
            {warnings.map((note) => (
              <Text key={note.code} size="sm" c="dark.1" style={{ overflowWrap: "anywhere" }}>
                {warningLine(note)}
              </Text>
            ))}
          </Stack>
        </Alert>
      ) : null}
    </Stack>
  );
}
