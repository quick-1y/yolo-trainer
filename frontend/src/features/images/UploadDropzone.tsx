import { Dropzone } from "@mantine/dropzone";
import { Title } from "@mantine/core";
import { useTranslation } from "react-i18next";

import classes from "./UploadDropzone.module.css";
import { useUpload } from "./UploadContext";

/**
 * Window-wide drop target for files and whole folders. Invisible while idle;
 * a drag over the window shows the overlay and a drop starts the same batched
 * upload as the buttons (busy handling and client pre-filter live in
 * startUpload).
 *
 * No `accept`: a folder drop contains non-images that must be reported as
 * rejected, and `accept` would mark the whole drop rejected. react-dropzone's
 * file-selector walks folders recursively and skips only .DS_Store/Thumbs.db.
 * `useFsAccessApi` is off for uniform behaviour on localhost and LAN http origins.
 */
export function UploadDropzone() {
  const { t } = useTranslation("images");
  const { startUpload } = useUpload();

  return (
    <Dropzone.FullScreen
      onDrop={(files) => startUpload(files)}
      useFsAccessApi={false}
      classNames={{ fullScreen: classes.fullScreen, root: classes.dropzone }}
    >
      <Title order={2} ta="center">
        {t("dropOverlay")}
      </Title>
    </Dropzone.FullScreen>
  );
}
