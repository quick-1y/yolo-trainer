import { afterEach, describe, expect, it, vi } from "vitest";

import { newId } from "./ids";

const UUID_V4 = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("newId", () => {
  it("builds a v4 UUID when crypto.randomUUID is missing (http LAN origin)", () => {
    const real = globalThis.crypto;
    // An insecure context has getRandomValues but no randomUUID.
    vi.stubGlobal("crypto", { getRandomValues: (array: Uint8Array) => real.getRandomValues(array) });
    expect((globalThis.crypto as { randomUUID?: unknown }).randomUUID).toBeUndefined();

    expect(newId()).toMatch(UUID_V4);
  });

  it("gives 1000 distinct values", () => {
    const real = globalThis.crypto;
    vi.stubGlobal("crypto", { getRandomValues: (array: Uint8Array) => real.getRandomValues(array) });

    const ids = new Set(Array.from({ length: 1000 }, () => newId()));

    expect(ids.size).toBe(1000);
    for (const id of ids) {
      expect(id).toMatch(UUID_V4);
    }
  });
});
