import type { UploadResponse } from "../api/images";

export interface BatchOutcome {
  files: File[];
  response?: UploadResponse;
  error?: unknown;
}

/**
 * Split files into upload batches of at most `maxFiles` files and `maxBytes`
 * bytes, preserving order. A single file above `maxBytes` still gets its own
 * batch (the caller pre-filters oversize files; the server is the authority).
 */
export function planBatches(files: File[], maxBytes: number, maxFiles = 10): File[][] {
  const batches: File[][] = [];
  let current: File[] = [];
  let currentBytes = 0;
  for (const file of files) {
    const full =
      current.length >= maxFiles || (current.length > 0 && currentBytes + file.size > maxBytes);
    if (full) {
      batches.push(current);
      current = [];
      currentBytes = 0;
    }
    current.push(file);
    currentBytes += file.size;
  }
  if (current.length > 0) {
    batches.push(current);
  }
  return batches;
}

interface RunUploadQueueOptions {
  batches: File[][];
  concurrency?: number;
  upload: (batch: File[], signal: AbortSignal) => Promise<UploadResponse>;
  signal: AbortSignal;
  onBatchDone: (outcome: BatchOutcome) => void;
}

/**
 * Run batches through `concurrency` workers that pull the next batch index.
 * Each finished batch is reported exactly once. After abort no new batch
 * starts and aborted in-flight requests report nothing; `cancelled` is true
 * when some batch was never reported because of the abort.
 */
export async function runUploadQueue({
  batches,
  concurrency = 3,
  upload,
  signal,
  onBatchDone,
}: RunUploadQueueOptions): Promise<{ cancelled: boolean }> {
  let next = 0;
  let reported = 0;

  async function worker(): Promise<void> {
    while (!signal.aborted && next < batches.length) {
      const batch = batches[next];
      next += 1;
      if (batch === undefined) {
        return;
      }
      let outcome: BatchOutcome;
      try {
        outcome = { files: batch, response: await upload(batch, signal) };
      } catch (error) {
        if (signal.aborted) {
          return;
        }
        outcome = { files: batch, error };
      }
      reported += 1;
      onBatchDone(outcome);
    }
  }

  const workers = Array.from({ length: Math.min(concurrency, batches.length) }, () => worker());
  await Promise.all(workers);
  return { cancelled: reported < batches.length };
}
