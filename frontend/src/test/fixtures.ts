import type { ImageItem } from "../api/images";

/**
 * One grid image as the server lists it: an unannotated 640 x 480 JPEG named after its id.
 * Pass overrides for the fields a test cares about.
 */
export function makeImageItem(overrides: Partial<ImageItem> = {}): ImageItem {
  const id = overrides.id ?? 1;
  return {
    id,
    filename: `img-${id}.jpg`,
    width: 640,
    height: 480,
    size_bytes: 1000,
    created_at: "2026-01-01T00:00:00Z",
    box_count: 0,
    is_background: false,
    is_reviewed: false,
    status: "unannotated",
    ...overrides,
  };
}
