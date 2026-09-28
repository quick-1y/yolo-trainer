import { screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { renderWithProviders } from "../test/render";
import { AppRoutes } from "../app/routes";

function mockFetchOnce(body: unknown, status = 200) {
  vi.stubGlobal(
    "fetch",
    vi.fn().mockResolvedValue(
      new Response(JSON.stringify(body), {
        status,
        headers: { "Content-Type": "application/json" },
      }),
    ),
  );
}

describe("LanguageSwitcher (rendered inside AppLayout header)", () => {
  it("shows both language options with their own names and marks English active by default", async () => {
    mockFetchOnce([]);
    renderWithProviders(<AppRoutes />, { route: "/projects" });

    expect(await screen.findByText("English")).toBeInTheDocument();
    expect(screen.getByText("Русский")).toBeInTheDocument();
    expect(screen.getByRole("radio", { name: "English" })).toBeChecked();
    expect(screen.getByRole("radio", { name: "Русский" })).not.toBeChecked();
  });

  it("switching to Russian updates the projects page title without a reload, and stores 'ru'", async () => {
    mockFetchOnce([]);
    const { user } = renderWithProviders(<AppRoutes />, { route: "/projects" });

    expect(await screen.findByText("YOLO Trainer")).toBeInTheDocument();
    expect(screen.getByText("Projects")).toBeInTheDocument();

    await user.click(screen.getByText("Русский"));

    expect(await screen.findByText("Проекты")).toBeInTheDocument();
    expect(screen.getByText("YOLO Trainer")).toBeInTheDocument();
    expect(localStorage.getItem("yolo-trainer.language")).toBe("ru");
  });

  it("switching to Russian then English round-trips both header and page titles and persists each choice", async () => {
    mockFetchOnce([]);
    const { user } = renderWithProviders(<AppRoutes />, { route: "/projects" });

    await screen.findByText("YOLO Trainer");

    await user.click(screen.getByText("Русский"));
    expect(await screen.findByText("Проекты")).toBeInTheDocument();
    expect(localStorage.getItem("yolo-trainer.language")).toBe("ru");

    await user.click(screen.getByText("English"));
    expect(await screen.findByText("Projects")).toBeInTheDocument();
    expect(localStorage.getItem("yolo-trainer.language")).toBe("en");
  });

  it("has an accessible label sourced from common:language.label", async () => {
    mockFetchOnce([]);
    renderWithProviders(<AppRoutes />, { route: "/projects" });

    expect(await screen.findByLabelText("Language")).toBeInTheDocument();
  });
});
