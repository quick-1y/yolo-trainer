import { describe, expect, it } from "vitest";

import type { UploadResponse } from "../api/images";
import { planBatches, runUploadQueue } from "./uploadQueue";
import type { BatchOutcome } from "./uploadQueue";

function file(name: string, size = 10): File {
  return new File([new Uint8Array(size)], name);
}

function files(count: number, size = 10): File[] {
  return Array.from({ length: count }, (_, i) => file(`f${i}.png`, size));
}

function okResponse(batch: File[]): UploadResponse {
  return {
    results: batch.map((f) => ({
      filename: f.name,
      status: "added" as const,
      reason: null,
      image: null,
    })),
  };
}

describe("planBatches", () => {
  it("splits 25 small files into batches of 10, 10 and 5", () => {
    const batches = planBatches(files(25), 1_000_000);
    expect(batches.map((b) => b.length)).toEqual([10, 10, 5]);
  });

  it("starts a new batch earlier when the byte limit would be exceeded", () => {
    const batches = planBatches(files(6, 400), 1000);
    expect(batches.map((b) => b.length)).toEqual([2, 2, 2]);
  });

  it("preserves submission order across batches", () => {
    const input = files(25);
    const flat = planBatches(input, 1_000_000).flat();
    expect(flat.map((f) => f.name)).toEqual(input.map((f) => f.name));
  });

  it("returns no batches for no files", () => {
    expect(planBatches([], 1000)).toEqual([]);
  });

  it("honours a custom maximum number of files", () => {
    expect(planBatches(files(5), 1_000_000, 2).map((b) => b.length)).toEqual([2, 2, 1]);
  });
});

describe("runUploadQueue", () => {
  it("never runs more than 3 uploads at once and reports each batch exactly once", async () => {
    const batches = planBatches(files(120), 1_000_000);
    expect(batches).toHaveLength(12);

    let inFlight = 0;
    let peak = 0;
    const outcomes: BatchOutcome[] = [];

    const result = await runUploadQueue({
      batches,
      concurrency: 3,
      signal: new AbortController().signal,
      upload: async (batch) => {
        inFlight += 1;
        peak = Math.max(peak, inFlight);
        await new Promise((resolve) => setTimeout(resolve, 5));
        inFlight -= 1;
        return okResponse(batch);
      },
      onBatchDone: (outcome) => outcomes.push(outcome),
    });

    expect(result.cancelled).toBe(false);
    expect(peak).toBe(3);
    expect(outcomes).toHaveLength(12);
    expect(outcomes.flatMap((o) => o.files).length).toBe(120);
  });

  it("reports an error outcome for a failed batch and still runs the others", async () => {
    const batches = planBatches(files(30), 1_000_000);
    const outcomes: BatchOutcome[] = [];

    await runUploadQueue({
      batches,
      concurrency: 3,
      signal: new AbortController().signal,
      upload: async (batch) => {
        if (batch[0]?.name === "f10.png") {
          throw new Error("Network down");
        }
        return okResponse(batch);
      },
      onBatchDone: (outcome) => outcomes.push(outcome),
    });

    expect(outcomes).toHaveLength(3);
    const failed = outcomes.filter((o) => o.error !== undefined);
    expect(failed).toHaveLength(1);
    expect(failed[0]?.files.map((f) => f.name)).toContain("f10.png");
    expect(outcomes.flatMap((o) => o.files).length).toBe(30);
  });

  it("starts no new batch after abort and resolves with cancelled = true", async () => {
    const batches = planBatches(files(60), 1_000_000);
    const controller = new AbortController();
    const started: number[] = [];
    const outcomes: BatchOutcome[] = [];

    const result = await runUploadQueue({
      batches,
      concurrency: 1,
      signal: controller.signal,
      upload: async (batch) => {
        started.push(started.length);
        return okResponse(batch);
      },
      onBatchDone: (outcome) => {
        outcomes.push(outcome);
        controller.abort();
      },
    });

    expect(result.cancelled).toBe(true);
    expect(started).toHaveLength(1);
    expect(outcomes).toHaveLength(1);
  });

  it("reports nothing for in-flight requests that were aborted", async () => {
    const batches = planBatches(files(30), 1_000_000);
    const controller = new AbortController();
    const outcomes: BatchOutcome[] = [];

    const running = runUploadQueue({
      batches,
      concurrency: 3,
      signal: controller.signal,
      upload: (_batch, signal) =>
        new Promise<UploadResponse>((_resolve, reject) => {
          signal.addEventListener("abort", () =>
            reject(new DOMException("Aborted", "AbortError")),
          );
        }),
      onBatchDone: (outcome) => outcomes.push(outcome),
    });

    controller.abort();
    const result = await running;

    expect(result.cancelled).toBe(true);
    expect(outcomes).toEqual([]);
  });

  it("reports every submitted file across outcomes when not aborted", async () => {
    const input = files(37);
    const outcomes: BatchOutcome[] = [];

    await runUploadQueue({
      batches: planBatches(input, 1_000_000),
      concurrency: 3,
      signal: new AbortController().signal,
      upload: async (batch) => okResponse(batch),
      onBatchDone: (outcome) => outcomes.push(outcome),
    });

    const reported = outcomes.flatMap((o) => o.files.map((f) => f.name)).sort();
    expect(reported).toEqual(input.map((f) => f.name).sort());
  });
});
