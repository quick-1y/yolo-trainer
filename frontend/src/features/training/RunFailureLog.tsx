import { Button, Code, Collapse, CopyButton, Group, Stack, Text } from "@mantine/core";
import { useState } from "react";
import { useTranslation } from "react-i18next";

interface RunFailureLogProps {
  /** The cleaned tail of the training output; null or empty when there was none. */
  log: string | null;
}

/**
 * Collapsed-by-default view of the last lines of a failed run's output (D-15).
 * The log is process output, so it is only ever rendered as text (T4-07-02).
 */
export function RunFailureLog({ log }: RunFailureLogProps) {
  const { t } = useTranslation("training");
  const [opened, setOpened] = useState(false);
  const hasLog = log !== null && log !== "";

  return (
    <Stack gap={8} align="flex-start">
      <Button
        variant="subtle"
        color="red"
        size="compact-sm"
        aria-expanded={opened}
        onClick={() => setOpened((current) => !current)}
      >
        {opened ? t("run.log.hide") : t("run.log.show")}
      </Button>
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
    </Stack>
  );
}
