import { Group, Text } from "@mantine/core";
import { useTranslation } from "react-i18next";

import { useStatusCounts } from "../../api/images";

/**
 * How far the whole project is annotated, whatever the grid's search shows (D-17).
 * `done` counts annotated, reviewed and background images alike: everything but unannotated.
 * Nothing renders while the counts load, when they fail, or for a project without images;
 * "Annotate next" does not depend on this row, the server resolves it.
 */
export function StatusSummary({ projectId }: { projectId: number }) {
  const { t, i18n } = useTranslation("images");
  const counts = useStatusCounts(projectId);
  if (counts.data === undefined || counts.data.total === 0) {
    return null;
  }
  const { total, unannotated, reviewed } = counts.data;
  const format = new Intl.NumberFormat(i18n.language);
  return (
    <Group
      data-testid="status-summary"
      wrap="wrap"
      gap={4}
      mt={8}
      style={{ fontVariantNumeric: "tabular-nums" }}
    >
      <Text size="sm" c="dark.1">
        {t("summary.progress", {
          done: format.format(total - unannotated),
          total: format.format(total),
        })}
      </Text>
      <Text size="sm" c="dark.1" aria-hidden>
        {" · "}
      </Text>
      <Text size="sm" c="dark.1">
        {t("summary.reviewed", { count: format.format(reviewed) })}
      </Text>
      {unannotated === 0 && (
        <>
          <Text size="sm" c="dark.1" aria-hidden>
            {" · "}
          </Text>
          <Text size="sm" c="dark.1">
            {t("summary.allDone")}
          </Text>
        </>
      )}
    </Group>
  );
}
