import { describe, expect, it } from "vitest";

import { runActiveSeconds } from "./duration";
import type { RunTiming } from "./duration";

const NOW = new Date("2026-01-15T10:06:05Z").getTime();

function timing(overrides: Partial<RunTiming> = {}): RunTiming {
  return {
    status: "queued",
    active_seconds: 0,
    segment_started_at: null,
    resume_count: 0,
    started_at: null,
    finished_at: null,
    ...overrides,
  };
}

describe("runActiveSeconds", () => {
  it("adds the live part of the open segment to the banked seconds while the run is running", () => {
    const run = timing({
      status: "running",
      active_seconds: 100,
      segment_started_at: "2026-01-15T10:05:45Z",
      started_at: "2026-01-15T09:00:00Z",
    });

    expect(runActiveSeconds(run, NOW)).toBe(120);
  });

  it("never counts a segment that starts in the future", () => {
    const run = timing({
      status: "running",
      active_seconds: 100,
      segment_started_at: "2026-01-15T10:07:00Z",
      started_at: "2026-01-15T10:07:00Z",
    });

    expect(runActiveSeconds(run, NOW)).toBe(100);
  });

  it("reports the banked seconds of a completed run, whatever the timestamps say", () => {
    const run = timing({
      status: "completed",
      active_seconds: 300,
      resume_count: 1,
      started_at: "2026-01-15T08:00:00Z",
      finished_at: "2026-01-15T10:00:00Z",
    });

    expect(runActiveSeconds(run, NOW)).toBe(300);
  });

  it("falls back to finished minus started for a Phase 4 run without banked time", () => {
    const run = timing({
      status: "completed",
      started_at: "2026-01-15T10:00:00Z",
      finished_at: "2026-01-15T10:05:00Z",
    });

    expect(runActiveSeconds(run, NOW)).toBe(300);
  });

  it("does not fall back for a resumed run: the gap between segments is not training time", () => {
    const run = timing({
      status: "interrupted",
      resume_count: 1,
      started_at: "2026-01-15T10:00:00Z",
      finished_at: "2026-01-15T10:05:00Z",
    });

    expect(runActiveSeconds(run, NOW)).toBe(0);
  });

  it("keeps the banked seconds of a resumed run while it waits in the queue", () => {
    const run = timing({
      status: "queued",
      active_seconds: 42.5,
      resume_count: 1,
      started_at: "2026-01-15T10:00:00Z",
    });

    expect(runActiveSeconds(run, NOW)).toBe(42.5);
  });

  it("is null for a run that never started", () => {
    expect(runActiveSeconds(timing({ status: "queued" }), NOW)).toBeNull();
    expect(runActiveSeconds(timing({ status: "preparing" }), NOW)).toBeNull();
    expect(
      runActiveSeconds(timing({ status: "failed", finished_at: "2026-01-15T10:05:00Z" }), NOW),
    ).toBeNull();
  });
});
