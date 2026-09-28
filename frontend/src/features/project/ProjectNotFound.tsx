import { Button, Stack, Text, Title } from "@mantine/core";
import { useTranslation } from "react-i18next";
import { Link } from "react-router-dom";

/**
 * Shown inside the project shell when the requested project id is invalid,
 * or the backend returns 404 (deleted or never existed) (D-05, D-11).
 */
export function ProjectNotFound() {
  const { t } = useTranslation("project");

  return (
    <Stack gap="sm" align="flex-start">
      <Title order={3}>{t("notFound.title")}</Title>
      <Text c="dimmed">{t("notFound.body")}</Text>
      <Button component={Link} to="/projects" variant="light">
        {t("notFound.back")}
      </Button>
    </Stack>
  );
}
