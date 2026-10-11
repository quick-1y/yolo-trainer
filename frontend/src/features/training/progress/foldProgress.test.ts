import { describe, expect, it } from "vitest";

import { bestEpoch, foldProgress, initialProgressState } from "./foldProgress";
import type { ChartRow, ProgressFrame, ProgressState } from "./foldProgress";

function fold(frames: ProgressFrame[]): ProgressState {
  return frames.reduce(foldProgress, initialProgressState);
}

function trainEnd(epoch: number, tloss: Record<string, number>, epochs = 10): ProgressFrame {
  return { event: "train_epoch_end", epoch, epochs, tloss };
}

function fitEnd(epoch: number, extra: ProgressFrame = {}): ProgressFrame {
  return {
    event: "fit_epoch_end",
    epoch,
    epochs: 10,
    final_validation: false,
    metrics: {},
    primary: { precision: 0.7, recall: 0.6, map50: 0.5, map50_95: 0.3 },
    ...extra,
  };
}

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

describe("foldProgress", () => {
  it("sums the discovered train loss components and keeps each part", () => {
    const state = fold([trainEnd(1, { box_loss: 1.2, cls_loss: 0.8, dfl_loss: 0.5 })]);

    expect(state.rows).toHaveLength(1);
    expect(state.rows[0].trainLoss).toBeCloseTo(2.5);
    expect(state.rows[0].trainParts).toEqual({ box: 1.2, cls: 0.8, dfl: 0.5 });
    expect(state.rows[0].valLoss).toBeNull();
    expect(state.lossComponents).toEqual(["box", "cls", "dfl"]);
  });

  it("reads validation loss components from val/ keys and discovers YOLO26 l1 without dfl", () => {
    const state = fold([
      trainEnd(1, { box_loss: 1.0, cls_loss: 0.5 }),
      fitEnd(1, { metrics: { "val/box_loss": 1.0, "val/l1_loss": 0.3, "metrics/mAP50(B)": 0.5 } }),
    ]);

    const [first] = state.rows;
    expect(first.valLoss).toBeCloseTo(1.3);
    expect(first.valParts).toEqual({ box: 1, l1: 0.3 });
    expect(first.trainLoss).toBeCloseTo(1.5);
    expect(first.precision).toBe(0.7);
    expect(first.recall).toBe(0.6);
    expect(first.map50).toBe(0.5);
    expect(first.map50_95).toBe(0.3);
    expect(state.lossComponents).toEqual(["box", "cls", "l1"]);
  });

  it("keeps one row per epoch and lets the later write win", () => {
    const state = fold([
      trainEnd(1, { box_loss: 1 }),
      trainEnd(1, { box_loss: 2 }),
      fitEnd(1),
      fitEnd(1, { primary: { precision: 0.9, recall: 0.8, map50: 0.7, map50_95: 0.4 } }),
    ]);

    expect(state.rows).toHaveLength(1);
    expect(state.rows[0].trainLoss).toBe(2);
    expect(state.rows[0].map50).toBe(0.7);
  });

  it("drops rows above start_epoch on train_start and records one boundary per resume", () => {
    const history = [1, 2, 3, 4].flatMap((epoch) => [trainEnd(epoch, { box_loss: epoch }), fitEnd(epoch)]);

    const resumed = fold([
      ...history,
      { event: "train_start", epochs: 10, start_epoch: 3, resumed: true, nb: 20 },
    ]);
    expect(resumed.rows.map((r) => r.epoch)).toEqual([1, 2, 3]);
    expect(resumed.resumeBoundaries).toEqual([3]);

    const again = foldProgress(resumed, {
      event: "train_start",
      epochs: 10,
      start_epoch: 3,
      resumed: true,
      nb: 20,
    });
    expect(again.resumeBoundaries).toEqual([3]);

    const fresh = fold([
      ...history,
      { event: "train_start", epochs: 10, start_epoch: 0, resumed: false, nb: 20 },
    ]);
    expect(fresh.resumeBoundaries).toEqual([]);
  });

  it("never turns the final validation into a row and keeps its metrics apart", () => {
    const state = fold([
      fitEnd(2),
      fitEnd(2, {
        final_validation: true,
        primary: { precision: 0.95, recall: 0.9, map50: 0.85, map50_95: 0.6 },
      }),
    ]);

    expect(state.rows).toHaveLength(1);
    expect(state.rows[0].map50).toBe(0.5);
    expect(state.finalMetrics).toEqual({ precision: 0.95, recall: 0.9, map50: 0.85, map50_95: 0.6 });
  });

  it("ignores batch_progress and tolerates events without v or the optional fields", () => {
    const state = fold([
      { event: "batch_progress", epoch: 1, batch: 3, nb: 20, epochs: 10 },
      { event: "fit_epoch_end", epoch: 1 },
      { event: "something_new" },
      {},
    ]);

    expect(state.rows).toEqual([row(1)]);
    expect(state.lossComponents).toEqual([]);
    expect(state.finalMetrics).toBeNull();
  });

  it("remembers the latest planned total of epochs", () => {
    const state = fold([trainEnd(1, { box_loss: 1 }, 10), trainEnd(2, { box_loss: 1 }, 12)]);

    expect(state.epochs).toBe(12);
    expect(initialProgressState.epochs).toBeNull();
  });

  it("keeps non-finite or non-numeric loss values out of the sums", () => {
    const state = fold([
      trainEnd(1, { box_loss: 1, cls_loss: Number.NaN, dfl_loss: "x" as unknown as number }),
    ]);

    expect(state.rows[0].trainLoss).toBe(1);
    expect(state.rows[0].trainParts).toEqual({ box: 1 });
  });

  it("stores the emitted fitness of a real epoch", () => {
    const state = fold([fitEnd(1, { fitness: 0.42 })]);

    expect(state.rows[0].fitness).toBe(0.42);
  });
});

describe("foldProgress segments and batches", () => {
  const start = (time: number, extra: ProgressFrame = {}): ProgressFrame => ({
    event: "train_start",
    epochs: 10,
    start_epoch: 0,
    resumed: false,
    nb: 20,
    time,
    ...extra,
  });

  it("starts with no batch, no segment and the training phase", () => {
    expect(initialProgressState.batch).toBeNull();
    expect(initialProgressState.segmentStart).toBeNull();
    expect(initialProgressState.segmentEpochEnds).toEqual([]);
    expect(initialProgressState.resumedFrom).toBeNull();
    expect(initialProgressState.phase).toBe("training");
  });

  it("keeps only the newest batch event, so a new epoch restarts the counter", () => {
    const state = fold([
      start(100),
      { event: "batch_progress", epoch: 1, batch: 5, nb: 20, time: 110 },
      { event: "batch_progress", epoch: 2, batch: 1, nb: 20, time: 160 },
    ]);

    expect(state.batch).toEqual({ epoch: 2, batch: 1, nb: 20, time: 160 });
    expect(state.rows).toEqual([]);
  });

  it("ignores a malformed batch event", () => {
    const state = fold([
      { event: "batch_progress", epoch: 1, batch: 0, nb: 20 },
      { event: "batch_progress", epoch: 1, batch: 3 },
    ]);

    expect(state.batch).toBeNull();
  });

  it("starts a segment on train_start: time, empty epoch ends, no batch, resume marker", () => {
    const state = fold([
      start(100),
      { event: "batch_progress", epoch: 1, batch: 5, nb: 20, time: 110 },
      trainEnd(1, { box_loss: 1 }),
      { event: "train_epoch_end", epoch: 2, epochs: 10, tloss: {}, time: 300 },
    ]);
    expect(state.segmentStart).toBe(100);
    expect(state.segmentEpochEnds).toEqual([{ epoch: 2, time: 300 }]);
    expect(state.resumedFrom).toBeNull();

    const resumed = foldProgress(state, start(900, { start_epoch: 2, resumed: true }));
    expect(resumed.segmentStart).toBe(900);
    expect(resumed.segmentEpochEnds).toEqual([]);
    expect(resumed.batch).toBeNull();
    expect(resumed.resumedFrom).toBe(2);

    const fresh = foldProgress(resumed, start(1200));
    expect(fresh.resumedFrom).toBeNull();
  });

  it("records the time of every finished epoch of the segment, one entry per epoch", () => {
    const state = fold([
      start(100),
      { event: "train_epoch_end", epoch: 1, epochs: 10, tloss: {}, time: 200 },
      { event: "train_epoch_end", epoch: 1, epochs: 10, tloss: {}, time: 210 },
      { event: "train_epoch_end", epoch: 2, epochs: 10, tloss: {}, time: 320 },
      { event: "train_epoch_end", epoch: 3, epochs: 10, tloss: {} },
    ]);

    expect(state.segmentEpochEnds).toEqual([
      { epoch: 1, time: 210 },
      { epoch: 2, time: 320 },
    ]);
  });
});

describe("bestEpoch", () => {
  it("picks the highest fitness and the later epoch on a tie", () => {
    const rows = [
      row(1, { fitness: 0.2, map50_95: 0.9 }),
      row(2, { fitness: 0.4 }),
      row(3, { fitness: 0.4 }),
    ];

    expect(bestEpoch(rows)?.epoch).toBe(3);
  });

  it("falls back to the highest mAP50-95 when no fitness was emitted", () => {
    const rows = [row(1, { map50_95: 0.2 }), row(2, { map50_95: 0.5 }), row(3, { map50_95: 0.3 })];

    expect(bestEpoch(rows)?.epoch).toBe(2);
  });

  it("is null without rows or without any value", () => {
    expect(bestEpoch([])).toBeNull();
    expect(bestEpoch([row(1)])).toBeNull();
  });
});
