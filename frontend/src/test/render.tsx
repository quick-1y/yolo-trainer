import { MantineProvider } from "@mantine/core";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render } from "@testing-library/react";
import type { RenderResult } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { ReactElement } from "react";
import { MemoryRouter } from "react-router-dom";

import i18n from "../i18n";
import { theme } from "../theme";

interface RenderWithProvidersOptions {
  route?: string;
  language?: string;
}

interface RenderWithProvidersResult extends RenderResult {
  user: ReturnType<typeof userEvent.setup>;
}

/**
 * Test-only render wrapper matching the app's real provider tree
 * (MantineProvider dark theme, a fresh QueryClient per test, and a router),
 * so component tests exercise the same context the app actually runs under.
 */
export function renderWithProviders(
  ui: ReactElement,
  { route = "/", language = "en" }: RenderWithProvidersOptions = {},
): RenderWithProvidersResult {
  void i18n.changeLanguage(language);

  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });

  const result = render(
    <MantineProvider theme={theme} forceColorScheme="dark">
      <QueryClientProvider client={queryClient}>
        <MemoryRouter initialEntries={[route]}>{ui}</MemoryRouter>
      </QueryClientProvider>
    </MantineProvider>,
  );

  return { ...result, user: userEvent.setup() };
}
