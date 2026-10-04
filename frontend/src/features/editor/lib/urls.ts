import type { ImageSort } from "../../../api/images";

/** The grid's sort and filename search, carried in the editor URL so Back restores them (D-03). */
export interface GridParams {
  sort?: ImageSort;
  q?: string;
}

/** Read the grid params from a URL query; unknown values fall back to the grid defaults. */
export function readGridParams(searchParams: URLSearchParams): GridParams {
  const sort: ImageSort = searchParams.get("sort") === "name" ? "name" : "newest";
  return { sort, q: (searchParams.get("q") ?? "").trim() };
}

function query(params: GridParams): string {
  const search = new URLSearchParams();
  if (params.sort === "name") {
    search.set("sort", "name");
  }
  if (params.q) {
    search.set("q", params.q);
  }
  const text = search.toString();
  return text ? `?${text}` : "";
}

export function imagesPath(projectId: number, params: GridParams = {}): string {
  return `/projects/${projectId}/images${query(params)}`;
}

export function editorPath(projectId: number, imageId: number, params: GridParams = {}): string {
  return `/projects/${projectId}/annotate/${imageId}${query(params)}`;
}
