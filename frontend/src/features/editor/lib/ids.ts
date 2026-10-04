/**
 * A random UUID v4 for a new box.
 *
 * `crypto.randomUUID()` exists only in secure contexts, so it is undefined on an
 * http LAN origin (the opt-in LAN setup). `getRandomValues` works everywhere;
 * the version and variant bits are set by hand and the backend validates the shape.
 */
export function newId(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(16));
  bytes[6] = (bytes[6] & 0x0f) | 0x40;
  bytes[8] = (bytes[8] & 0x3f) | 0x80;
  const hex = Array.from(bytes, (byte) => byte.toString(16).padStart(2, "0")).join("");
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}
