import { screen, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { AppRoutes } from "../../app/routes";
import { renderWithProviders } from "../../test/render";
import { makeOptions, makeRun, stubTrainingApi } from "../../test/trainingApi";
import type { StubTrainingApi } from "../../test/trainingApi";

const NEW_PATH = "/projects/1/training/new";
const DEFAULT_DEVICE = "Automatic (GPU if available, otherwise CPU)";

type FormView = ReturnType<typeof renderWithProviders> & { api: StubTrainingApi };

async function openForm(
  stub: Parameters<typeof stubTrainingApi>[0] = {},
  language = "en",
): Promise<FormView> {
  const api = stubTrainingApi(stub);
  const view = renderWithProviders(<AppRoutes />, { route: NEW_PATH, language });
  await screen.findByRole("button", { name: language === "ru" ? "Начать обучение" : "Start training" });
  await waitFor(() => expect(screen.getByLabelText(/Run name|Название запуска/)).toHaveValue("run-1"));
  return Object.assign(view, { api });
}

async function replaceValue(
  view: FormView,
  label: string,
  value: string,
) {
  const input = screen.getByLabelText(label);
  await view.user.clear(input);
  if (value !== "") {
    await view.user.type(input, value);
  }
  return input;
}

describe("NewRunPage form", () => {
  it("opens pre-filled with the standard defaults and no empty field", async () => {
    await openForm();

    expect(screen.getByLabelText("Run name")).toHaveValue("run-1");
    expect(screen.getByLabelText("Run name")).toHaveAttribute("maxlength", "100");
    expect(screen.getByLabelText("Base model")).toHaveValue("yolo26n");
    expect(screen.getByLabelText("Epochs")).toHaveValue("100");
    expect(screen.getByLabelText("Image size")).toHaveValue("640");
    expect(screen.getByLabelText("Device")).toHaveValue(DEFAULT_DEVICE);
    expect(screen.getByRole("radio", { name: "Auto" })).toBeChecked();
    expect(screen.queryByRole("textbox", { name: "Batch size" })).toBeNull();
  });

  it("marks Training as the active sidebar section", async () => {
    await openForm();

    expect(screen.getByRole("link", { name: "Training" })).toHaveAttribute("data-active", "true");
  });

  it("lists the official models with their size descriptions", async () => {
    const view = await openForm();

    await view.user.click(screen.getByLabelText("Base model"));

    expect(await screen.findByText("Official Ultralytics models")).toBeInTheDocument();
    expect(screen.getAllByRole("option")).toHaveLength(10);
    expect(screen.getByText("Smallest and fastest")).toBeInTheDocument();
    expect(screen.getByText("Largest and most accurate")).toBeInTheDocument();
    expect(screen.getByRole("option", { name: /yolo11x/ })).toBeInTheDocument();
  });

  it("opens a segment project on the seg base", async () => {
    await openForm({
      project: { id: 1, name: "Masks", task_type: "segment" },
      options: makeOptions({
        task_type: "segment",
        official: [{ name: "yolo26n-seg", size: "n" }],
        default_base: "yolo26n-seg",
      }),
    });

    expect(screen.getByLabelText("Base model")).toHaveValue("yolo26n-seg");
  });
});

describe("NewRunPage devices", () => {
  it("offers Automatic and CPU only, with both hints, when no GPU was reported", async () => {
    const view = await openForm();

    await view.user.click(screen.getByLabelText("Device"));
    const options = await screen.findAllByRole("option");
    expect(options.map((option) => option.textContent)).toEqual([DEFAULT_DEVICE, "CPU"]);
    expect(screen.getByText("No GPU was detected, so training runs on the CPU.")).toBeInTheDocument();
    expect(screen.getByText(/Training on a CPU is slow/)).toBeInTheDocument();
  });

  it("offers a GPU option that hides the CPU hint and is sent as device 0", async () => {
    const options = makeOptions({
      devices: { gpus: [{ index: 0, name: "RTX 4090" }], worker_fresh: true },
    });
    const view = await openForm({ options });

    expect(screen.queryByText("No GPU was detected, so training runs on the CPU.")).toBeNull();
    expect(screen.queryByText(/Training on a CPU is slow/)).toBeNull();
    await view.user.click(screen.getByLabelText("Device"));
    await view.user.click(await screen.findByRole("option", { name: "GPU 0: RTX 4090" }));
    expect(screen.queryByText(/Training on a CPU is slow/)).toBeNull();

    await view.user.click(screen.getByRole("button", { name: "Start training" }));
    await waitFor(() => expect(view.api.posts).toHaveLength(1));
    expect(view.api.posts[0].device).toBe("0");
  });

  it("shows the CPU hint when CPU is chosen on a GPU host", async () => {
    const options = makeOptions({
      devices: { gpus: [{ index: 0, name: "RTX 4090" }], worker_fresh: true },
    });
    const view = await openForm({ options });

    await view.user.click(screen.getByLabelText("Device"));
    await view.user.click(await screen.findByRole("option", { name: "CPU" }));

    expect(await screen.findByText(/Training on a CPU is slow/)).toBeInTheDocument();
  });
});

describe("NewRunPage validation", () => {
  it("rejects an image size that is not a multiple of 32 and sends nothing", async () => {
    const view = await openForm();

    const input = await replaceValue(view, "Image size", "650");
    await view.user.tab();
    expect(
      await screen.findByText("Image size must be a multiple of 32, from 32 to 2048."),
    ).toBeInTheDocument();
    expect(input).toHaveValue("650");

    await view.user.click(screen.getByRole("button", { name: "Start training" }));
    expect(view.api.posts).toHaveLength(0);
  });

  it("rejects zero epochs", async () => {
    const view = await openForm();

    await replaceValue(view, "Epochs", "0");
    await view.user.tab();

    expect(await screen.findByText("Epochs must be a whole number from 1 to 1000.")).toBeInTheDocument();
    await view.user.click(screen.getByRole("button", { name: "Start training" }));
    expect(view.api.posts).toHaveLength(0);
  });

  it("rejects a custom batch above 512", async () => {
    const view = await openForm();

    await view.user.click(screen.getByRole("radio", { name: "Custom" }));
    const batch = screen.getByRole("textbox", { name: "Batch size" });
    expect(batch).toHaveValue("16");
    await view.user.clear(batch);
    await view.user.type(batch, "600");
    await view.user.tab();

    expect(await screen.findByText("Batch size must be a whole number from 1 to 512.")).toBeInTheDocument();
    await view.user.click(screen.getByRole("button", { name: "Start training" }));
    expect(view.api.posts).toHaveLength(0);
  });

  it("requires a name", async () => {
    const view = await openForm();

    await replaceValue(view, "Run name", "");
    await view.user.click(screen.getByRole("button", { name: "Start training" }));

    expect(await screen.findByText("Name is required.")).toBeInTheDocument();
    expect(view.api.posts).toHaveLength(0);
  });
});

describe("NewRunPage submit", () => {
  const CREATED = makeRun({ id: 12, name: "run-1", status: "preparing", queue_position: null });

  it("sends the default settings and opens the new run's page", async () => {
    const view = await openForm({ run: CREATED, createResult: CREATED });

    await view.user.click(screen.getByRole("button", { name: "Start training" }));

    await waitFor(() => expect(view.api.posts).toHaveLength(1));
    expect(view.api.posts[0]).toEqual({
      name: "run-1",
      base: { kind: "official", name: "yolo26n" },
      epochs: 100,
      imgsz: 640,
      batch: -1,
      device: "auto",
    });
    expect(await screen.findByText("Preparing the dataset…")).toBeInTheDocument();
    expect(view.api.count("GET /api/projects/1/runs/12")).toBeGreaterThan(0);
  });

  it("sends a custom batch", async () => {
    const view = await openForm({ run: CREATED, createResult: CREATED });

    await view.user.click(screen.getByRole("radio", { name: "Custom" }));
    await view.user.click(screen.getByRole("button", { name: "Start training" }));

    await waitFor(() => expect(view.api.posts).toHaveLength(1));
    expect(view.api.posts[0].batch).toBe(16);
  });

  it("sends one POST for a double click", async () => {
    const view = await openForm({ run: CREATED, createResult: CREATED });

    await view.user.dblClick(screen.getByRole("button", { name: "Start training" }));

    await screen.findByText("Preparing the dataset…");
    expect(view.api.posts).toHaveLength(1);
  });

  it("shows a name conflict under the name input and keeps the values", async () => {
    const view = await openForm({
      createStatus: 409,
      createResult: { detail: "A run named run-1 already exists in this project." },
    });

    await replaceValue(view, "Epochs", "50");
    await view.user.click(screen.getByRole("button", { name: "Start training" }));

    expect(
      await screen.findByText("A run named run-1 already exists in this project."),
    ).toBeInTheDocument();
    expect(screen.getByLabelText("Epochs")).toHaveValue("50");
    expect(screen.queryByRole("alert")).toBeNull();
  });

  it("shows any other failure in a red alert above the buttons and keeps the values", async () => {
    const view = await openForm({
      createStatus: 422,
      createResult: { detail: "Train needs annotated images." },
    });

    await replaceValue(view, "Epochs", "50");
    await view.user.click(screen.getByRole("button", { name: "Start training" }));

    expect(await screen.findByText("Train needs annotated images.")).toBeInTheDocument();
    expect(screen.getByLabelText("Epochs")).toHaveValue("50");
    expect(screen.getByLabelText("Run name")).toHaveValue("run-1");
    expect(screen.getByRole("button", { name: "Start training" })).toBeEnabled();
  });
});

describe("NewRunPage loading", () => {
  it("disables Start and shows skeletons while the options load", async () => {
    stubTrainingApi({});
    const original = globalThis.fetch;
    let release: (() => void) | undefined;
    vi.stubGlobal(
      "fetch",
      vi.fn(async (input: string | URL | Request, init?: RequestInit) => {
        const url = typeof input === "string" ? input : input.toString();
        if (url.endsWith("/training/options")) {
          await new Promise<void>((resolve) => {
            release = resolve;
          });
        }
        return original(input, init);
      }),
    );
    renderWithProviders(<AppRoutes />, { route: NEW_PATH });

    expect(await screen.findByTestId("newrun-loading")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Start training" })).toBeDisabled();
    release?.();
    await waitFor(() => expect(screen.getByLabelText("Run name")).toHaveValue("run-1"));
    expect(screen.getByRole("button", { name: "Start training" })).toBeEnabled();
  });

  it("shows the API message and refetches on Try again after an options failure", async () => {
    let failing = true;
    stubTrainingApi({});
    const original = globalThis.fetch;
    vi.stubGlobal(
      "fetch",
      vi.fn(async (input: string | URL | Request, init?: RequestInit) => {
        const url = typeof input === "string" ? input : input.toString();
        if (failing && url.endsWith("/training/options")) {
          return new Response(JSON.stringify({ detail: "Database is unavailable." }), {
            status: 500,
            headers: { "Content-Type": "application/json" },
          });
        }
        return original(input, init);
      }),
    );
    const { user } = renderWithProviders(<AppRoutes />, { route: NEW_PATH });

    expect(await screen.findByText("Database is unavailable.")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Start training" })).toBeDisabled();
    failing = false;
    await user.click(screen.getByRole("button", { name: "Try again" }));
    await waitFor(() => expect(screen.getByLabelText("Run name")).toHaveValue("run-1"));
  });

  it("renders the form in Russian", async () => {
    await openForm({}, "ru");

    expect(screen.getByLabelText("Название запуска")).toHaveValue("run-1");
    expect(screen.getByRole("button", { name: "Начать обучение" })).toBeInTheDocument();
  });
});
