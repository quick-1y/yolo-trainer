import { create } from "zustand";

export type EditorTool = "select" | "box";

/**
 * Editor UI state that is never saved and never part of undo history: the
 * active tool and the selected / hovered box. A plain zustand store at module
 * level (not tracked by zundo), because it is shared by the tool bar, the
 * canvas and, later, the object list.
 */
interface EditorUiState {
  /** "box" is the default: the draw-many workflow (D-05). */
  tool: EditorTool;
  selectedId: string | null;
  hoveredId: string | null;
  /**
   * The class new boxes are drawn with (D-05). Null until the user picks one; the
   * editor then falls back to the first class. It outlives an image change, so the
   * draw-many workflow keeps its class from image to image.
   */
  activeClassId: number | null;
  setTool: (tool: EditorTool) => void;
  select: (id: string | null) => void;
  hover: (id: string | null) => void;
  setActiveClass: (id: number | null) => void;
  /** A new image starts with nothing selected or hovered; the tool and the active class are kept. */
  resetForImage: () => void;
}

const INITIAL = { tool: "box", selectedId: null, hoveredId: null, activeClassId: null } as const;

export const useEditorUi = create<EditorUiState>()((set) => ({
  ...INITIAL,
  // Only the Select tool can hold a selection; leaving it drops the Transformer.
  setTool: (tool) =>
    set((state) => ({
      tool,
      selectedId: tool === "select" ? state.selectedId : null,
      hoveredId: null,
    })),
  select: (id) => set({ selectedId: id }),
  hover: (id) => set({ hoveredId: id }),
  setActiveClass: (id) => set({ activeClassId: id }),
  resetForImage: () => set({ selectedId: null, hoveredId: null }),
}));

/** Back to the defaults (tests). */
export function resetEditorUi(): void {
  useEditorUi.setState({ ...INITIAL });
}
