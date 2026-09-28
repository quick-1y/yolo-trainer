import { describe, expect, it } from "vitest";

// Eagerly load every namespace JSON file, mirroring index.ts's own glob, so
// this test automatically picks up any future namespace/locale addition
// (e.g. Plan 08's `project` namespace) without being edited.
const modules = import.meta.glob("./locales/*/*.json", {
  eager: true,
  import: "default",
}) as Record<string, unknown>;

type FlatKeys = Set<string>;

function flattenKeys(value: unknown, prefix = ""): FlatKeys {
  const keys: FlatKeys = new Set();
  if (value === null || typeof value !== "object") {
    keys.add(prefix);
    return keys;
  }
  for (const [key, child] of Object.entries(value as Record<string, unknown>)) {
    const dotted = prefix ? `${prefix}.${key}` : key;
    for (const leaf of flattenKeys(child, dotted)) {
      keys.add(leaf);
    }
  }
  return keys;
}

// Group content by namespace -> { [lng]: content }.
const byNamespace = new Map<string, Record<string, unknown>>();
for (const [path, content] of Object.entries(modules)) {
  const match = /\.\/locales\/([^/]+)\/([^/]+)\.json$/.exec(path);
  if (!match) continue;
  const [, lng, ns] = match;
  const existing = byNamespace.get(ns) ?? {};
  existing[lng] = content;
  byNamespace.set(ns, existing);
}

describe("locale key parity (en vs ru)", () => {
  it("found at least one namespace to check", () => {
    expect(byNamespace.size).toBeGreaterThan(0);
  });

  for (const [ns, byLng] of byNamespace.entries()) {
    it(`namespace "${ns}" has identical keys in en and ru`, () => {
      const enKeys = flattenKeys(byLng.en ?? {});
      const ruKeys = flattenKeys(byLng.ru ?? {});

      const missingInRu = [...enKeys].filter((key) => !ruKeys.has(key));
      const missingInEn = [...ruKeys].filter((key) => !enKeys.has(key));

      const messages: string[] = [];
      if (missingInRu.length > 0) {
        messages.push(`Missing in ru/${ns}.json: ${missingInRu.join(", ")}`);
      }
      if (missingInEn.length > 0) {
        messages.push(`Missing in en/${ns}.json: ${missingInEn.join(", ")}`);
      }

      expect(messages.join("; ")).toBe("");
    });
  }
});
