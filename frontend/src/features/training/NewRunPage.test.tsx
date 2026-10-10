import { screen, waitFor, within } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { AppRoutes } from "../../app/routes";
import { renderWithProviders } from "../../test/render";
import {
  makeOptions,
  makeRun,
  makeSummary,
  makeTrainedModel,
  stubTrainingApi,
} from "../../test/trainingApi";
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

/** The Select's own input: its label is also the listbox's accessible name. */
function selectInput(label: string): HTMLElement {
  const input = screen.getAllByLabelText(label).find((element) => element.tagName === "INPUT");
  if (input === undefined) {
    throw new Error(`No select input labelled ${label}`);
  }
  return input;
}

/**
 * The options of one Select. jsdom computes no popover position, so Mantine leaves the open
 * dropdown at `display: none`; the options are queried (and clicked) as hidden elements.
 */
function optionsOf(label: string): HTMLElement[] {
  const listbox = screen.getByRole("listbox", { name: label, hidden: true });
  return within(listbox).getAllByRole("option", { hidden: true });
}

function optionNamed(label: string, name: string | RegExp): HTMLElement {
  const found = optionsOf(label).find((option) =>
    typeof name === "string" ? option.textContent === name : name.test(option.textContent ?? ""),
  );
  if (found === undefined) {
    throw new Error(`No option ${String(name)} in ${label}`);
  }
  return found;
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
    expect(selectInput("Base model")).toHaveValue("yolo26n");
    expect(screen.getByLabelText("Epochs")).toHaveValue("100");
    expect(screen.getByLabelText("Image size")).toHaveValue("640");
    expect(selectInput("Device")).toHaveValue(DEFAULT_DEVICE);
    expect(screen.getByRole("radio", { name: "Auto" })).toBeChecked();
    expect(screen.queryByRole("textbox", { name: "Batch size" })).toBeNull();
  });

  it("marks Training as the active sidebar section", async () => {
    await openForm();

    expect(screen.getByRole("link", { name: "Training" })).toHaveAttribute("data-active", "true");
  });

  it("lists the official models with their size descriptions", async () => {
    const view = await openForm();

    await view.user.click(selectInput("Base model"));

    expect(await screen.findByText("Official Ultralytics models")).toBeInTheDocument();
    expect(optionsOf("Base model")).toHaveLength(10);
    expect(optionNamed("Base model", /yolo26n/)).toHaveTextContent("Smallest and fastest");
    expect(screen.getAllByText("Smallest and fastest")).toHaveLength(2);
    expect(screen.getAllByText("Largest and most accurate")).toHaveLength(2);
    expect(optionNamed("Base model", /yolo11x/)).toHaveTextContent("Largest and most accurate");
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

    expect(selectInput("Base model")).toHaveValue("yolo26n-seg");
  });
});

describe("NewRunPage devices", () => {
  it("offers Automatic and CPU only, with both hints, when no GPU was reported", async () => {
    const view = await openForm();

    await view.user.click(selectInput("Device"));
    expect(optionsOf("Device").map((option) => option.textContent)).toEqual([
      DEFAULT_DEVICE,
      "CPU",
    ]);
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
    await view.user.click(selectInput("Device"));
    await view.user.click(optionNamed("Device", "GPU 0: RTX 4090"));
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

    await view.user.click(selectInput("Device"));
    await view.user.click(optionNamed("Device", "CPU"));

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

const realMatchMedia = window.matchMedia;

/** The viewport is at least 1200px wide (form and summary side by side) or narrower. */
function setWideViewport(wide: boolean): void {
  window.matchMedia = (query: string) => ({
    matches: wide && query.includes("(min-width: 1200px)"),
    media: query,
    onchange: null,
    addListener: () => undefined,
    removeListener: () => undefined,
    addEventListener: () => undefined,
    removeEventListener: () => undefined,
    dispatchEvent: () => false,
  });
}

afterEach(() => {
  window.matchMedia = realMatchMedia;
});

const BLOCKED_TRAIN = makeOptions({
  summary: makeSummary({
    train: { used: 0, unannotated: 2 },
    unassigned: 4,
  }),
  blockers: [{ code: "trainEmpty", count: 0, names: [] }],
});

function startButton(): HTMLElement {
  return screen.getByRole("button", { name: "Start training" });
}

describe("NewRunPage layout", () => {
  it("puts the form and a 320 px summary side by side at 1200 px and wider", async () => {
    setWideViewport(true);
    await openForm();

    const layout = screen.getByTestId("newrun-layout");
    await waitFor(() => expect(layout.style.gridTemplateColumns).toBe("minmax(0, 1fr) 320px"));
    const form = screen.getByTestId("newrun-form");
    const summary = screen.getByTestId("dataset-summary");
    expect(form.compareDocumentPosition(summary) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });

  it("shows the summary before the form in a single column below 1200 px", async () => {
    setWideViewport(false);
    await openForm();

    const layout = screen.getByTestId("newrun-layout");
    expect(layout.style.gridTemplateColumns).toBe("minmax(0, 1fr)");
    const form = screen.getByTestId("newrun-form");
    const summary = screen.getByTestId("dataset-summary");
    expect(summary.compareDocumentPosition(form) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });
});

describe("NewRunPage dataset summary", () => {
  const EXAMPLE = makeOptions({
    summary: makeSummary({
      train: { used: 4, unannotated: 2 },
      valid: { used: 1, unannotated: 0 },
      test: { used: 0, unannotated: 0 },
      unassigned: 4,
      class_count: 2,
    }),
  });

  function rowCells(split: string): string[] {
    const row = screen.getByTestId(`summary-row-${split}`);
    return within(row)
      .getAllByRole("cell")
      .map((cell) => cell.textContent ?? "");
  }

  it("shows used and not annotated images per split, the unassigned line and the class count", async () => {
    await openForm({ options: EXAMPLE });

    const summary = screen.getByTestId("dataset-summary");
    expect(within(summary).getByText("Dataset")).toBeInTheDocument();
    expect(rowCells("train")).toEqual(["4", "2"]);
    expect(rowCells("valid")).toEqual(["1", "—"]);
    expect(rowCells("test")).toEqual(["0", "—"]);
    expect(within(screen.getByTestId("summary-row-train")).getByRole("rowheader")).toHaveTextContent(
      "Train",
    );
    expect(within(summary).getByText("Images without a split (not used): 4")).toBeInTheDocument();
    expect(within(summary).getByText("Classes: 2")).toBeInTheDocument();
    expect(within(summary).getByText("Test is optional.")).toBeInTheDocument();
    expect(within(summary).getByRole("link", { name: "Images page" })).toHaveAttribute(
      "href",
      "/projects/1/images",
    );
  });

  it("hides the Test hint once Test has images and formats big numbers", async () => {
    await openForm({
      options: makeOptions({
        summary: makeSummary({
          train: { used: 12345, unannotated: 0 },
          test: { used: 3, unannotated: 1 },
        }),
      }),
    });

    expect(rowCells("train")).toEqual(["12,345", "—"]);
    expect(rowCells("test")).toEqual(["3", "1"]);
    expect(screen.queryByText("Test is optional.")).toBeNull();
  });

  it("shows zeros everywhere for a project with no assigned images", async () => {
    await openForm({
      options: makeOptions({
        summary: makeSummary({
          train: { used: 0, unannotated: 0 },
          valid: { used: 0, unannotated: 0 },
          unassigned: 9,
        }),
        blockers: [
          { code: "trainEmpty", count: 0, names: [] },
          { code: "validEmpty", count: 0, names: [] },
        ],
      }),
    });

    expect(rowCells("train")).toEqual(["0", "—"]);
    expect(rowCells("valid")).toEqual(["0", "—"]);
    expect(screen.getByText("Images without a split (not used): 9")).toBeInTheDocument();
    const blockers = screen.getByTestId("notes-blockers");
    expect(within(blockers).getAllByText(/No annotated images are assigned to/)).toHaveLength(2);
  });

  it("disables the summary's Split dataset button when every image has a split", async () => {
    await openForm();

    const summary = screen.getByTestId("dataset-summary");
    expect(within(summary).getByRole("button", { name: "Split dataset" })).toBeDisabled();
    expect(within(summary).getByText("All images already have a split.")).toBeInTheDocument();
  });

  it("renders the summary in Russian", async () => {
    await openForm({ options: EXAMPLE }, "ru");

    const summary = screen.getByTestId("dataset-summary");
    expect(within(summary).getByText("Набор данных")).toBeInTheDocument();
    expect(within(summary).getByText("Классов: 2")).toBeInTheDocument();
    expect(
      within(summary).getByText("Изображений без выборки (не используются): 4"),
    ).toBeInTheDocument();
  });

  it("shows five skeleton rows while the options load", async () => {
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

    const loading = await screen.findByTestId("summary-loading");
    expect(loading.children).toHaveLength(5);
    expect(startButton()).toBeDisabled();
    release?.();
    await waitFor(() => expect(screen.queryByTestId("summary-loading")).toBeNull());
  });

  it("shows a failed load in the summary with Try again and keeps Start disabled", async () => {
    stubTrainingApi({ optionsStatus: 500 });
    renderWithProviders(<AppRoutes />, { route: NEW_PATH });

    const summary = await screen.findByTestId("dataset-summary");
    expect(await within(summary).findByText("Database is unavailable.")).toBeInTheDocument();
    expect(within(summary).getByRole("button", { name: "Try again" })).toBeInTheDocument();
    expect(startButton()).toBeDisabled();
  });
});

describe("NewRunPage blockers and warnings", () => {
  it("lists a blocker with a Split dataset link, disables Start and refreshes after Apply", async () => {
    let applied = false;
    const view = await openForm({
      options: () => (applied ? makeOptions() : BLOCKED_TRAIN),
      onSplitApply: () => {
        applied = true;
      },
    });

    const blockers = screen.getByTestId("notes-blockers");
    expect(within(blockers).getByText("Cannot start yet")).toBeInTheDocument();
    expect(
      within(blockers).getByText(
        /No annotated images are assigned to Train\. Assign images to it or split the dataset automatically\./,
      ),
    ).toBeInTheDocument();
    expect(startButton()).toBeDisabled();

    await view.user.click(within(blockers).getByRole("button", { name: "Split dataset" }));
    const dialog = await screen.findByRole("dialog", { name: "Split dataset automatically" });
    const apply = within(dialog).getByRole("button", { name: "Apply split" });
    await waitFor(() => expect(apply).toBeEnabled());
    await view.user.click(apply);

    await waitFor(() => expect(startButton()).toBeEnabled());
    expect(view.api.splitApplies).toHaveLength(1);
    expect(view.api.count("GET /api/projects/1/training/options")).toBe(2);
    expect(screen.queryByTestId("notes-blockers")).toBeNull();
  });

  it("opens the same dialog from the summary button", async () => {
    const view = await openForm({ options: BLOCKED_TRAIN });

    await view.user.click(
      within(screen.getByTestId("dataset-summary")).getByRole("button", { name: "Split dataset" }),
    );

    expect(
      await screen.findByRole("dialog", { name: "Split dataset automatically" }),
    ).toBeInTheDocument();
  });

  it("offers no split link when no image is unassigned", async () => {
    await openForm({
      options: makeOptions({
        summary: makeSummary({ train: { used: 0, unannotated: 3 } }),
        blockers: [{ code: "trainEmpty", count: 0, names: [] }],
      }),
    });

    const blockers = screen.getByTestId("notes-blockers");
    expect(within(blockers).queryByRole("button", { name: "Split dataset" })).toBeNull();
    expect(startButton()).toBeDisabled();
  });

  it("links the no-classes blocker to the Classes page", async () => {
    await openForm({
      options: makeOptions({
        summary: makeSummary({ class_count: 0 }),
        blockers: [{ code: "noClasses", count: 0, names: [] }],
      }),
    });

    const blockers = screen.getByTestId("notes-blockers");
    expect(
      within(blockers).getByText(/This project has no classes\. Add at least one class first\./),
    ).toBeInTheDocument();
    expect(within(blockers).getByRole("link", { name: "Go to Classes" })).toHaveAttribute(
      "href",
      "/projects/1/classes",
    );
    expect(startButton()).toBeDisabled();
  });

  it("shows warnings in a second alert and never disables Start", async () => {
    await openForm({
      options: makeOptions({
        warnings: [
          { code: "unannotated", count: 2, names: [] },
          { code: "unassigned", count: 4, names: [] },
          { code: "classesMissingValid", count: 5, names: ["a", "b", "c", "d", "e"] },
          { code: "classesMissingTrain", count: 1, names: ["only"] },
          { code: "workerStale", count: 0, names: [] },
        ],
      }),
    });

    const warnings = screen.getByTestId("notes-warnings");
    expect(screen.queryByTestId("notes-blockers")).toBeNull();
    expect(
      within(warnings).getByText("Unannotated images that will not be used: 2."),
    ).toBeInTheDocument();
    expect(
      within(warnings).getByText("Images without a split that will not be used: 4."),
    ).toBeInTheDocument();
    expect(warnings).toHaveTextContent(
      "No examples in Valid for these classes: a, b, c …and 2 more.",
    );
    expect(warnings).toHaveTextContent("No examples in Train for these classes: only.");
    expect(
      within(warnings).getByText(
        "The training worker is not responding. The run will wait in the queue until it starts.",
      ),
    ).toBeInTheDocument();
    expect(startButton()).toBeEnabled();
  });

  it("hides both alerts when there is nothing to say", async () => {
    await openForm();

    expect(screen.queryByTestId("notes-blockers")).toBeNull();
    expect(screen.queryByTestId("notes-warnings")).toBeNull();
  });

  it("words a blocker in Russian", async () => {
    await openForm({ options: BLOCKED_TRAIN }, "ru");

    const blockers = screen.getByTestId("notes-blockers");
    expect(within(blockers).getByText("Пока нельзя начать")).toBeInTheDocument();
    expect(
      within(blockers).getByText(/В выборке «Обучение» нет размеченных изображений\./),
    ).toBeInTheDocument();
  });
});

describe("NewRunPage models trained here", () => {
  const WITH_MODELS = makeOptions({
    models: [
      makeTrainedModel(),
      makeTrainedModel({
        id: 9,
        name: "older",
        project_id: 1,
        project_name: "Plates",
        map50: null,
        classes_match: false,
      }),
    ],
  });

  it("groups models trained here under the official ones with their metrics", async () => {
    const view = await openForm({ options: WITH_MODELS });

    await view.user.click(selectInput("Base model"));

    expect(await screen.findByText("Models trained here")).toBeInTheDocument();
    expect(optionsOf("Base model")).toHaveLength(12);
    const trained = optionNamed("Base model", /best-cars · Plates/);
    expect(trained).toHaveTextContent("mAP50 0.812 · classes: 2");
    expect(optionNamed("Base model", /older · Plates/)).toHaveTextContent("mAP50 — · classes: 2");
    expect(within(trained).getByTitle("best-cars · Plates")).toBeInTheDocument();
  });

  it("omits the group when no model was trained here", async () => {
    const view = await openForm();

    await view.user.click(selectInput("Base model"));

    expect(await screen.findByText("Official Ultralytics models")).toBeInTheDocument();
    expect(screen.queryByText("Models trained here")).toBeNull();
  });

  it("uses the same grouped rendering for a single model", async () => {
    const view = await openForm({ options: makeOptions({ models: [makeTrainedModel()] }) });

    await view.user.click(selectInput("Base model"));

    expect(await screen.findByText("Models trained here")).toBeInTheDocument();
    expect(optionsOf("Base model")).toHaveLength(11);
  });

  it("sends the chosen model's id as the base", async () => {
    const view = await openForm({ options: WITH_MODELS, createResult: makeRun({ id: 12 }) });

    await view.user.click(selectInput("Base model"));
    await view.user.click(optionNamed("Base model", /best-cars · Plates/));
    await view.user.click(startButton());

    await waitFor(() => expect(view.api.posts).toHaveLength(1));
    expect(view.api.posts[0].base).toEqual({ kind: "model", model_id: 4 });
  });

  it("warns when the model's classes differ and still lets the user start", async () => {
    const view = await openForm({ options: WITH_MODELS });
    const note = /This model's classes differ from this project's classes\./;

    await view.user.click(selectInput("Base model"));
    await view.user.click(optionNamed("Base model", /best-cars · Plates/));
    expect(screen.queryByText(note)).toBeNull();

    await view.user.click(selectInput("Base model"));
    await view.user.click(optionNamed("Base model", /older · Plates/));
    expect(await screen.findByText(note)).toBeInTheDocument();
    expect(startButton()).toBeEnabled();
  });

  it("has no base select until the options load", async () => {
    stubTrainingApi({});
    renderWithProviders(<AppRoutes />, { route: NEW_PATH });

    expect(await screen.findByTestId("newrun-loading")).toBeInTheDocument();
    expect(screen.queryByLabelText("Base model")).toBeNull();
  });
});
