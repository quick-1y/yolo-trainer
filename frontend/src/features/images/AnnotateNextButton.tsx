import { Button } from "@mantine/core";
import { notifications } from "@mantine/notifications";
import { useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { useNavigate } from "react-router-dom";

import { ApiError } from "../../api/client";
import { type ImageSort, getNextUnannotated, imageKeys, useStatusCounts } from "../../api/images";
import { editorPath } from "../editor/lib/urls";

interface AnnotateNextButtonProps {
  projectId: number;
  /** The grid's current order and search: the lookup walks the same list the user sees (D-16). */
  sort: ImageSort;
  query: string;
}

/**
 * The grid's way into the annotate loop: opens the editor on the first image that still
 * needs work, in the grid's sort and search order. Disabled when the project-wide counts
 * say nothing is left; while the counts are unknown the server decides.
 */
export function AnnotateNextButton({ projectId, sort, query }: AnnotateNextButtonProps) {
  const { t } = useTranslation("images");
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const counts = useStatusCounts(projectId);
  const [loading, setLoading] = useState(false);
  const nothingLeft = counts.data !== undefined && counts.data.unannotated === 0;

  const handleClick = async () => {
    setLoading(true);
    try {
      const { image_id: imageId } = await getNextUnannotated(projectId, { sort, q: query });
      if (imageId === null) {
        // Another tab finished the last image since the counts were read: refresh them.
        void queryClient.invalidateQueries({ queryKey: imageKeys.summary(projectId) });
        notifications.show({ color: "green", message: t("summary.allDone") });
        return;
      }
      navigate(editorPath(projectId, imageId, { sort, q: query }));
    } catch (error) {
      // Server messages are shown verbatim (P1 D-05).
      notifications.show({
        color: "red",
        message: error instanceof ApiError ? error.message : String(error),
      });
    } finally {
      setLoading(false);
    }
  };

  return (
    <Button loading={loading} disabled={nothingLeft} onClick={() => void handleClick()}>
      {t("annotateNext")}
    </Button>
  );
}
