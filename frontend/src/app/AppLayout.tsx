import { AppShell, Group, Title } from "@mantine/core";
import { useTranslation } from "react-i18next";
import { Outlet } from "react-router-dom";

import { LanguageSwitcher } from "../components/LanguageSwitcher";

export function AppLayout() {
  const { t } = useTranslation("common");

  return (
    <AppShell header={{ height: 60 }} padding="md">
      <AppShell.Header>
        <Group h="100%" px="md" justify="space-between">
          <Title order={3}>{t("app.title")}</Title>
          <LanguageSwitcher />
        </Group>
      </AppShell.Header>
      <AppShell.Main>
        <Outlet />
      </AppShell.Main>
    </AppShell>
  );
}
