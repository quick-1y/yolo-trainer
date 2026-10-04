import type { ProjectClassItem } from "../../api/classes";
import type { EditorStore } from "./store/annotationStore";

interface ObjectListProps {
  /** The open image's store; null until the annotation set is loaded. */
  store: EditorStore | null;
  classes: ProjectClassItem[] | undefined;
  /** Called after a class was chosen in a row, to hand the keyboard back to the editor. */
  onReleaseFocus: () => void;
}

/** Skeleton so the tests can import the component; the list itself comes with the GREEN commit. */
export function ObjectList(_props: ObjectListProps) {
  return null;
}
