import { MantineProvider } from "@mantine/core";
import { Notifications } from "@mantine/notifications";
import "@mantine/notifications/styles.css";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { useEffect } from "react";
import { useTranslation } from "react-i18next";
import { BrowserRouter } from "react-router-dom";

import { theme } from "../theme";
import { AppRoutes } from "./routes";

const queryClient = new QueryClient();

function DocumentTitle() {
  const { t } = useTranslation("common");
  useEffect(() => {
    document.title = t("app.title");
  }, [t]);
  return null;
}

export function App() {
  return (
    // D-04: dark theme only, no toggle code path.
    <MantineProvider theme={theme} forceColorScheme="dark">
      <Notifications />
      <QueryClientProvider client={queryClient}>
        <BrowserRouter>
          <DocumentTitle />
          <AppRoutes />
        </BrowserRouter>
      </QueryClientProvider>
    </MantineProvider>
  );
}
