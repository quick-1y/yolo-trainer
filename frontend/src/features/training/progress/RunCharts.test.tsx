import { screen, within } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { renderWithProviders } from "../../../test/render";
import { useSizedRechartsContainers } from "../../../test/rechartsSize";
import { ChartTooltip } from "./ChartTooltip";
import type { TooltipSeries } from "./ChartTooltip";
import { bestEpoch, foldProgress, initialProgressState } from "./foldProgress";
import type { ChartRow, ProgressFrame, ProgressState } from "./foldProgress";
import { RunCharts, epochTicks } from "./RunCharts";
import type { StreamConnection } from "./useRunStream";

useSizedRechartsContainers();

const LOSS_SERIES: TooltipSeries[] = [
  { key: "trainLoss", label: "Train", color: "var(--mantine-color-violet-4)", dashed: false },
  { key: "valLoss", label: "Validation", color: "var(--mantine-color-pink-4)", dashed: true },
];

const MAP_SERIES: TooltipSeries[] = [
  { key: "map50", label: "mAP50", color: "var(--mantine-color-lime-4)", dashed: false },
  { key: "map50_95", label: "mAP50-95", color: "var(--mantine-color-grape-4)", dashed: true },
];

function row(epoch: number, overrides: Partial<ChartRow> = {}): ChartRow {
  return {
    epoch,
    map50: null,
    map50_95: null,
    precision: null,
    recall: null,
    trainLoss: null,
    valLoss: null,
    trainParts: {},
    valParts: {},
    fitness: null,
    ...overrides,
  };
}

function stateFrom(frames: ProgressFrame[]): ProgressState {
  return frames.reduce(foldProgress, initialProgressState);
}

function epochFrames(epoch: number, map5095: number, extra: ProgressFrame = {}): ProgressFrame[] {
  return [
    { event: "train_epoch_end", epoch, epochs: 10, tloss: { box_loss: 1, cls_loss: 0.5 } },
    {
      event: "fit_epoch_end",
      epoch,
      epochs: 10,
      final_validation: false,
      metrics: { "val/box_loss": 0.9 },
      primary: { precision: 0.7, recall: 0.6, map50: map5095 + 0.1, map50_95: map5095 },
      ...extra,
    },
  ];
}

interface Props {
  progress: ProgressState;
  connection?: StreamConnection;
  running?: boolean;
  onRetry?: () => void;
}

function renderCharts({ progress, connection = "open", running = true, onRetry }: Props) {
  return renderWithProviders(
    <RunCharts
      progress={progress}
      connection={connection}
      running={running}
      epochs={10}
      onRetry={onRetry ?? (() => undefined)}
    />,
  );
}

/** What a component rendered, without the style tags MantineProvider puts next to it. */
function rendered(container: HTMLElement): Element[] {
  return Array.from(container.children).filter((element) => element.tagName !== "STYLE");
}

function tooltipRow(key: string): HTMLElement {
  return screen.getByTestId(`tooltip-row-${key}`);
}

describe("ChartTooltip", () => {
  const lossRow = row(4, {
    trainLoss: 2.5,
    trainParts: { box: 1.2, cls: 0.8, dfl: 0.5 },
  });

  it("shows the epoch, a row per series with a dash for the missing one and the component grid", () => {
    renderWithProviders(
      <ChartTooltip
        active
        label={4}
        kind="loss"
        series={LOSS_SERIES}
        components={["box", "cls", "dfl"]}
        payload={[{ payload: lossRow }]}
      />,
    );

    expect(screen.getByText("Epoch 4")).toBeInTheDocument();
    expect(within(tooltipRow("trainLoss")).getByText("Train")).toBeInTheDocument();
    expect(within(tooltipRow("trainLoss")).getByText("2.500")).toBeInTheDocument();
    expect(within(tooltipRow("valLoss")).getByText("Validation")).toBeInTheDocument();
    expect(within(tooltipRow("valLoss")).getByText("—")).toBeInTheDocument();

    const grid = screen.getByRole("table");
    expect(within(grid).getByRole("columnheader", { name: "Train" })).toBeInTheDocument();
    expect(within(grid).getByRole("columnheader", { name: "Validation" })).toBeInTheDocument();
    // One header row and one row per component, each with its Train and Validation cell.
    const rows = within(grid).getAllByRole("row");
    expect(rows).toHaveLength(4);
    expect(within(rows[1]).getByText("box")).toBeInTheDocument();
    expect(within(rows[1]).getByText("1.200")).toBeInTheDocument();
    expect(within(rows[1]).getByText("—")).toBeInTheDocument();
  });

  it("renders one grid row per component up to ten and never truncates the names", () => {
    const names = ["box", "cls", "dfl", "l1", "seg", "sem", "pose", "kobj", "angle", "very_long_component_name"];
    const parts = Object.fromEntries(names.map((name, index) => [name, index + 0.5]));
    renderWithProviders(
      <ChartTooltip
        active
        label={2}
        kind="loss"
        series={LOSS_SERIES}
        components={names}
        payload={[{ payload: row(2, { trainLoss: 1, trainParts: parts }) }]}
      />,
    );

    expect(within(screen.getByRole("table")).getAllByRole("row")).toHaveLength(11);
    expect(screen.getByText("very_long_component_name")).toBeInTheDocument();
  });

  it("renders a single component as a single grid row", () => {
    renderWithProviders(
      <ChartTooltip
        active
        label={1}
        kind="loss"
        series={LOSS_SERIES}
        components={["box"]}
        payload={[{ payload: row(1, { trainLoss: 1, trainParts: { box: 1 } }) }]}
      />,
    );

    expect(within(screen.getByRole("table")).getAllByRole("row")).toHaveLength(2);
  });

  it("keeps a series row with a dash when its value is missing at the hovered epoch", () => {
    renderWithProviders(
      <ChartTooltip
        active
        label={3}
        kind="map"
        series={MAP_SERIES}
        payload={[{ payload: row(3, { map50: 0.5 }) }]}
      />,
    );

    expect(within(tooltipRow("map50")).getByText("0.500")).toBeInTheDocument();
    expect(within(tooltipRow("map50_95")).getByText("—")).toBeInTheDocument();
    expect(screen.queryByRole("table")).toBeNull();
  });

  it("says Best epoch only when the hovered epoch is the best one", () => {
    const payload = [{ payload: row(3, { map50: 0.5, map50_95: 0.4 }) }];
    const best = renderWithProviders(
      <ChartTooltip active label={3} kind="map" series={MAP_SERIES} payload={payload} bestEpoch={3} />,
    );
    expect(screen.getByText("Best epoch")).toBeInTheDocument();
    best.unmount();

    renderWithProviders(
      <ChartTooltip active label={3} kind="map" series={MAP_SERIES} payload={payload} bestEpoch={2} />,
    );
    expect(screen.getByText("Epoch 3")).toBeInTheDocument();
    expect(screen.queryByText("Best epoch")).toBeNull();
  });

  it("renders nothing while inactive or without a payload", () => {
    const view = renderWithProviders(
      <ChartTooltip active={false} label={1} kind="map" series={MAP_SERIES} payload={[]} />,
    );
    expect(rendered(view.container)).toHaveLength(0);
  });

  it("renders component names as text only", () => {
    const hostile = '<img src=x onerror="alert(1)">';
    renderWithProviders(
      <ChartTooltip
        active
        label={1}
        kind="loss"
        series={LOSS_SERIES}
        components={[hostile]}
        payload={[{ payload: row(1, { trainLoss: 1, trainParts: { [hostile]: 1 } }) }]}
      />,
    );

    expect(document.querySelector("img")).toBeNull();
    expect(screen.getByText(hostile)).toBeInTheDocument();
  });

  it("speaks Russian", () => {
    renderWithProviders(
      <ChartTooltip active label={4} kind="map" series={MAP_SERIES} payload={[{ payload: row(4) }]} />,
      { language: "ru" },
    );

    expect(screen.getByText("Эпоха 4")).toBeInTheDocument();
  });
});

describe("RunCharts best epoch and resumes", () => {
  it("marks the epoch with the highest fitness and says so under the mAP chart", () => {
    const progress = stateFrom([
      ...epochFrames(1, 0.2, { fitness: 0.2 }),
      ...epochFrames(2, 0.4, { fitness: 0.4 }),
      ...epochFrames(3, 0.4, { fitness: 0.4 }),
    ]);
    expect(bestEpoch(progress.rows)?.epoch).toBe(3);

    renderCharts({ progress });

    const map = screen.getByRole("group", { name: "mAP" });
    expect(within(map).getByText("Best epoch: 3 (mAP50-95 0.400)")).toBeInTheDocument();
    expect(map.querySelectorAll(".recharts-reference-dot")).toHaveLength(1);
    expect(screen.getByRole("group", { name: "Loss" }).querySelectorAll(".recharts-reference-dot")).toHaveLength(0);
  });

  it("falls back to the highest mAP50-95 without fitness", () => {
    const progress = stateFrom([...epochFrames(1, 0.2), ...epochFrames(2, 0.5), ...epochFrames(3, 0.3)]);

    renderCharts({ progress });

    expect(screen.getByText("Best epoch: 2 (mAP50-95 0.500)")).toBeInTheDocument();
  });

  it("draws one dotted line per chart and a Resumed legend item for a resumed run", () => {
    const progress = stateFrom([
      ...epochFrames(1, 0.2),
      ...epochFrames(2, 0.3),
      ...epochFrames(3, 0.4),
      { event: "train_start", epochs: 10, start_epoch: 3, resumed: true, nb: 20 },
      ...epochFrames(4, 0.5),
    ]);

    renderCharts({ progress });

    for (const name of ["Loss", "mAP", "Precision and recall"]) {
      const group = screen.getByRole("group", { name });
      expect(within(group).getByText("Resumed")).toBeInTheDocument();
      expect(group.querySelectorAll(".recharts-reference-line")).toHaveLength(1);
    }
  });

  it("shows no Resumed item and no boundary line for a run that never resumed", () => {
    renderCharts({ progress: stateFrom(epochFrames(1, 0.2)) });

    expect(screen.queryByText("Resumed")).toBeNull();
    expect(document.querySelectorAll(".recharts-reference-line")).toHaveLength(0);
  });
});

describe("RunCharts shapes", () => {
  it("shows a dot for each point of a one or two epoch run and none from three epochs", () => {
    const view = renderCharts({ progress: stateFrom(epochFrames(1, 0.2)) });
    expect(view.container.querySelectorAll(".recharts-line-dot").length).toBeGreaterThan(0);
    view.unmount();

    const many = renderCharts({
      progress: stateFrom([...epochFrames(1, 0.2), ...epochFrames(2, 0.3), ...epochFrames(3, 0.4)]),
    });
    expect(many.container.querySelectorAll(".recharts-line-dot")).toHaveLength(0);
  });

  it("keeps five integer ticks from the first to the planned epoch, even at 1000 epochs", () => {
    expect(epochTicks(10)).toEqual([1, 3, 6, 8, 10]);
    expect(epochTicks(1000)).toHaveLength(5);
    expect(epochTicks(1000).at(-1)).toBe(1000);
    expect(epochTicks(2)).toEqual([1, 2]);

    const rows = Array.from({ length: 1000 }, (_, index) =>
      row(index + 1, { trainLoss: 1 / (index + 1), map50: index / 1000, map50_95: index / 2000 }),
    );
    const view = renderCharts({ progress: { ...initialProgressState, rows, epochs: 1000 } });
    expect(view.container.querySelectorAll(".recharts-line-dot")).toHaveLength(0);
    expect(screen.getAllByRole("group")).toHaveLength(3);
  });
});

describe("RunCharts stream states", () => {
  it("shows three skeleton panels until the stream has opened", () => {
    renderCharts({ progress: initialProgressState, connection: "connecting" });

    expect(screen.getAllByTestId("chart-skeleton")).toHaveLength(3);
    expect(screen.queryByRole("group")).toBeNull();
  });

  it("shows the waiting panel for a running run without a finished epoch", () => {
    renderCharts({ progress: initialProgressState, connection: "open", running: true });

    expect(screen.getByText("Charts appear after the first epoch finishes.")).toBeInTheDocument();
    expect(screen.queryByTestId("chart-skeleton")).toBeNull();
    expect(screen.queryByRole("group")).toBeNull();
  });

  it("renders no chart section for a finished run with zero epochs", () => {
    const view = renderCharts({ progress: initialProgressState, connection: "ended", running: false });

    expect(rendered(view.container)).toHaveLength(0);
  });

  it("keeps the charts and shows a small Reconnecting line while the browser retries", () => {
    renderCharts({ progress: stateFrom(epochFrames(1, 0.2)), connection: "reconnecting" });

    expect(screen.getByText("Reconnecting…")).toBeInTheDocument();
    expect(screen.getAllByRole("group")).toHaveLength(3);
  });

  it("keeps the last data and offers Try again when the stream is unavailable", async () => {
    const onRetry = vi.fn();
    const view = renderCharts({
      progress: stateFrom(epochFrames(1, 0.2)),
      connection: "unavailable",
      onRetry,
    });

    const note = screen.getByRole("status");
    expect(note).toHaveTextContent("Live updates are unavailable. Charts show data up to the last update.");
    expect(screen.getAllByRole("group")).toHaveLength(3);

    await view.user.click(within(note).getByRole("button", { name: "Try again" }));
    expect(onRetry).toHaveBeenCalledTimes(1);
  });

  it("shows no note while the stream is open", () => {
    renderCharts({ progress: stateFrom(epochFrames(1, 0.2)), connection: "open" });

    expect(screen.queryByRole("status")).toBeNull();
    expect(screen.queryByText("Reconnecting…")).toBeNull();
  });
});
