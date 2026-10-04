import { notifications } from "@mantine/notifications";
import { useCallback } from "react";
import { useTranslation } from "react-i18next";
import { useSearchParams } from "react-router-dom";

import { ApiError } from "../../api/client";
import { getNextUnannotated } from "../../api/images";
import { editorPath, readGridParams } from "./lib/urls";
import type { EditorNavigation } from "./useEditorNavigation";

/** How long the "no other unannotated image" notice stays up. */
const NO_OTHER_MS = 4000;

/**
 * "Next unannotated" (D-16), shared by the top bar button and the N key: save the image,
 * ask the server for the first unannotated image after this one in the grid's order (same
 * sort and search, wrapping to the start), and go there. With none left, or when the lookup
 * fails, the user stays and is told why.
 */
export function useNextUnannotated(
  projectId: number,
  imageId: number,
  navigation: EditorNavigation,
): () => void {
  const { t } = useTranslation("editor");
  const [searchParams] = useSearchParams();
  const { sort, q } = readGridParams(searchParams);
  const { goTo } = navigation;

  return useCallback(() => {
    const lookup = async (): Promise<string | null> => {
      try {
        const next = await getNextUnannotated(projectId, { sort, q, after: imageId });
        if (next.image_id === null) {
          notifications.show({ color: "gray", message: t("nav.noOther"), autoClose: NO_OTHER_MS });
          return null;
        }
        return editorPath(projectId, next.image_id, { sort, q });
      } catch (error) {
        notifications.show({
          color: "red",
          message: error instanceof ApiError ? error.message : String(error),
        });
        return null;
      }
    };
    void goTo(lookup, "nextUnannotated");
  }, [goTo, projectId, imageId, sort, q, t]);
}
