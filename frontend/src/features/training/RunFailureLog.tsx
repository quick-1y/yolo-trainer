import { Button, Code, Collapse, CopyButton, Group, Stack, Text } from "@mantine/core";
import { useDisclosure } from "@mantine/hooks";
import { useTranslation } from "react-i18next";

/** One open/closed state shared by the toggle (in the action row) and the log body below it. */
export function useRunFailureLog() {
  const [opened, { toggle }] = useDisclosure(false);
  return { opened, toggle };
}

interface RunFailureLogToggleProps {
  opened: boolean;
  onToggle: () => void;
}

/** "Show log" / "Hide log": sits in the alert's action row next to "New training" (D-15). */
export function RunFailureLogToggle({ opened, onToggle }: RunFailureLogToggleProps) {
  const { t } = useTranslation("training");
  return (
    <Button
      variant="subtle"
      color="red"
      size="compact-sm"
      aria-expanded={opened}
      onClick={onToggle}
    >
      {opened ? t("run.log.hide") : t("run.log.show")}
    </Button>
  );
}

interface RunFailureLogBodyProps {
  /** The cleaned tail of the training output; null or empty when there was none. */
  log: string | null;
  opened: boolean;
}

/**
 * Collapsed-by-default view of the last lines of a failed run's output (D-15).
 * The log is process output, so it is only ever rendered as text (T4-07-02).
 */
export function RunFailureLogBody({ log, opened }: RunFailureLogBodyProps) {
  const { t } = useTranslation("training");
  const hasLog = log !== null && log !== "";

  return (
    <Collapse expanded={opened} style={{ width: "100%" }}>
      <Stack gap={8}>
        <Text fz={12} c="dark.1">
          {t("run.log.title")}
        </Text>
        {hasLog ? (
          <>
            <Code
              block
              fz={12}
              style={{
                maxHeight: 320,
                overflow: "auto",
                whiteSpace: "pre-wrap",
                overflowWrap: "anywhere",
              }}
            >
              {log}
            </Code>
            <Group>
              <CopyButton value={log}>
                {({ copied, copy }) => (
                  <Button variant="default" size="compact-sm" onClick={copy}>
                    {copied ? t("run.log.copied") : t("run.log.copy")}
                  </Button>
                )}
              </CopyButton>
            </Group>
          </>
        ) : (
          <Text size="sm" c="dark.1">
            {t("run.log.empty")}
          </Text>
        )}
      </Stack>
    </Collapse>
  );
}
