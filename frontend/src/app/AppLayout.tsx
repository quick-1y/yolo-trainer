import { AppShell, Title } from "@mantine/core";
import { useTranslation } from "react-i18next";
import { Outlet } from "react-router-dom";

export function AppLayout() {
  const { t } = useTranslation("common");

  return (
    <AppShell header={{ height: 60 }} padding="md">
      <AppShell.Header>
        <Title order={3} px="md" style={{ lineHeight: "60px" }}>
          {t("app.title")}
        </Title>
      </AppShell.Header>
      <AppShell.Main>
        <Outlet />
      </AppShell.Main>
    </AppShell>
  );
}
