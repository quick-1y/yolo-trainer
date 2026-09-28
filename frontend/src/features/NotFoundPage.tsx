import { Button, Stack, Text, Title } from "@mantine/core";
import { useTranslation } from "react-i18next";
import { Link } from "react-router-dom";

/**
 * Catch-all page for any unknown SPA route. Reuses the `project` i18n
 * namespace's `pageNotFound.*`/`notFound.back` keys so this plan does not
 * need to touch Plan 07's `common` namespace files.
 */
export function NotFoundPage() {
  const { t } = useTranslation("project");

  return (
    <Stack gap="sm" align="center" py="xl">
      <Title order={2}>{t("pageNotFound.title")}</Title>
      <Text c="dimmed">{t("pageNotFound.body")}</Text>
      <Button component={Link} to="/projects" variant="light">
        {t("notFound.back")}
      </Button>
    </Stack>
  );
}
