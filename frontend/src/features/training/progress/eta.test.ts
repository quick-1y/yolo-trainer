import { describe, expect, it } from "vitest";

import { estimateRemainingSeconds } from "./eta";
import { foldProgress, initialProgressState } from "./foldProgress";
import type { ProgressFrame, ProgressState } from "./foldProgress";

function fold(frames: ProgressFrame[]): ProgressState {
  return frames.reduce(foldProgress, initialProgressState);
}

function start(time: number, extra: ProgressFrame = {}): ProgressFrame {
  return { event: "train_start", epochs: 5, start_epoch: 0, resumed: false, nb: 10, time, ...extra };
}

function epochEnd(epoch: number, time: number, epochs = 5): ProgressFrame {
  return { event: "train_epoch_end", epoch, epochs, tloss: { box_loss: 1 }, time };
}

function batch(epoch: number, count: number, time: number, nb = 10): ProgressFrame {
  return { event: "batch_progress", epoch, epochs: 5, batch: count, nb, time };
}

describe("estimateRemainingSeconds", () => {
  it("averages the finished epochs and counts the fraction of the running one", () => {
    const state = fold([start(1000), epochEnd(1, 1100), epochEnd(2, 1200), batch(3, 5, 1250)]);

    expect(estimateRemainingSeconds(state)).toBe(250);
  });

  it("falls back to the batch fraction before any epoch has finished", () => {
    const state = fold([start(1000), batch(1, 2, 1020)]);

    expect(estimateRemainingSeconds(state)).toBe(480);
  });

  it("is unknown without a finished epoch or a batch fraction", () => {
    expect(estimateRemainingSeconds(fold([start(1000)]))).toBeNull();
    expect(estimateRemainingSeconds(initialProgressState)).toBeNull();
  });

  it("is unknown when the planned number of epochs is unknown", () => {
    expect(estimateRemainingSeconds({ ...fold([start(1000), epochEnd(1, 1100)]), epochs: null })).toBeNull();
  });

  it("uses only the last five epoch durations", () => {
    // Durations 500, 100, 100, 100, 100, 100: the first one falls out of the window.
    const state = fold([
      start(0, { epochs: 10 }),
      epochEnd(1, 500, 10),
      epochEnd(2, 600, 10),
      epochEnd(3, 700, 10),
      epochEnd(4, 800, 10),
      epochEnd(5, 900, 10),
      epochEnd(6, 1000, 10),
    ]);

    expect(estimateRemainingSeconds(state)).toBe(400);
  });

  it("ignores the idle gap before a resume and everything measured before it", () => {
    const state = fold([
      start(1000),
      epochEnd(1, 1100),
      epochEnd(2, 1200),
      // The service was down for a long time; the resume starts at epoch 2.
      start(5000, { start_epoch: 2, resumed: true }),
      epochEnd(3, 5050),
    ]);

    // One delta of 50 s since the new segment start, two epochs left.
    expect(estimateRemainingSeconds(state)).toBe(100);
  });

  it("measures a resumed segment from its own start while no epoch has finished", () => {
    const state = fold([
      start(1000),
      epochEnd(1, 1100),
      epochEnd(2, 1200),
      start(5000, { start_epoch: 2, resumed: true }),
      batch(3, 5, 5030),
    ]);

    // Half an epoch took 30 s, so an epoch costs 60 s: (5 - 2 - 0.5) x 60.
    expect(estimateRemainingSeconds(state)).toBe(150);
  });

  it("ignores a batch event that belongs to an older epoch", () => {
    const state = fold([start(1000), epochEnd(1, 1100), batch(1, 9, 1090)]);

    expect(estimateRemainingSeconds(state)).toBe(400);
  });

  it("rounds to the nearest ten seconds and never goes below zero", () => {
    expect(estimateRemainingSeconds(fold([start(0), epochEnd(1, 33), batch(2, 1, 40)]))).toBe(130);
    expect(estimateRemainingSeconds(fold([start(0), epochEnd(1, 100), epochEnd(2, 200), epochEnd(3, 300), epochEnd(4, 400), epochEnd(5, 500)]))).toBe(0);
  });
});
