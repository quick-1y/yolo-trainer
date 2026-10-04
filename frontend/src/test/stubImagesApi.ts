import type { StatusCounts } from "../api/images";

const SIDE_PATH = /^\/api\/projects\/\d+\/images\/(status-counts|next-unannotated)$/;

interface ImagesSideOptions {
  /** GET .../images/status-counts; every count defaults to zero, so the grid shows no summary. */
  counts?: Partial<StatusCounts>;
  /** GET .../images/next-unannotated: the image id, or null for "none" (the default). */
  next?: number | null;
}

function json(body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status: 200,
    headers: { "Content-Type": "application/json" },
  });
}

/**
 * The two read-only requests the Images page makes next to its list: the project's status
 * counts and the "Annotate next" lookup. Strict grid stubs call it before their own
 * `Unexpected request` throw (RESEARCH Pitfall 13), so a test about something else does not
 * have to know the page asks. Returns null for every other path.
 */
export function handleImagesSideRequest(
  url: URL,
  options: ImagesSideOptions = {},
): Response | null {
  const match = SIDE_PATH.exec(url.pathname);
  if (match === null) {
    return null;
  }
  if (match[1] === "status-counts") {
    const counts: StatusCounts = {
      total: 0,
      unannotated: 0,
      annotated: 0,
      reviewed: 0,
      background: 0,
      ...options.counts,
    };
    return json(counts);
  }
  return json({ image_id: options.next ?? null });
}
