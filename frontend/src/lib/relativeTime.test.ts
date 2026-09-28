import { describe, expect, it } from "vitest";

import { formatRelativeTime } from "./relativeTime";

const NOW = new Date("2026-09-24T12:00:00.000Z");

describe("formatRelativeTime", () => {
  it("formats 72 hours ago as '3 days ago' in English", () => {
    const then = new Date(NOW.getTime() - 72 * 60 * 60 * 1000).toISOString();
    expect(formatRelativeTime(then, "en", NOW)).toBe("3 days ago");
  });

  it("formats 72 hours ago as '3 дня назад' in Russian", () => {
    const then = new Date(NOW.getTime() - 72 * 60 * 60 * 1000).toISOString();
    expect(formatRelativeTime(then, "ru", NOW)).toBe("3 дня назад");
  });

  it("formats 30 seconds ago as '30 seconds ago' in English", () => {
    const then = new Date(NOW.getTime() - 30 * 1000).toISOString();
    expect(formatRelativeTime(then, "en", NOW)).toBe("30 seconds ago");
  });

  it("formats 30 seconds ago as '30 секунд назад' in Russian", () => {
    const then = new Date(NOW.getTime() - 30 * 1000).toISOString();
    expect(formatRelativeTime(then, "ru", NOW)).toBe("30 секунд назад");
  });

  it("clamps a future timestamp to 'now' in English", () => {
    const future = new Date(NOW.getTime() + 60 * 1000).toISOString();
    expect(formatRelativeTime(future, "en", NOW)).toBe("now");
  });

  it("clamps a future timestamp to 'сейчас' in Russian", () => {
    const future = new Date(NOW.getTime() + 60 * 1000).toISOString();
    expect(formatRelativeTime(future, "ru", NOW)).toBe("сейчас");
  });
});
