import { Button, FileButton, Group } from "@mantine/core";
import { useEffect, useRef } from "react";
import { useTranslation } from "react-i18next";

import { useAppConfig } from "../../api/config";
import { useUpload } from "./UploadContext";

const ACCEPT = "image/jpeg,image/png,image/webp,image/bmp";

/**
 * "Upload images" (file picker) and "Upload folder" (directory picker).
 * Both are disabled while an upload runs or until the server limits load.
 * Reused by the empty state of the Images page.
 */
export function UploadButtons() {
  const { t } = useTranslation("images");
  const { state, startUpload } = useUpload();
  const config = useAppConfig();
  const folderInput = useRef<HTMLInputElement>(null);
  const disabled = state.status === "running" || config.data === undefined;

  // React's input typings lack webkitdirectory/directory, so set them directly.
  useEffect(() => {
    folderInput.current?.setAttribute("webkitdirectory", "");
    folderInput.current?.setAttribute("directory", "");
  }, []);

  return (
    <Group gap={8}>
      <FileButton onChange={startUpload} accept={ACCEPT} multiple>
        {(props) => (
          <Button {...props} disabled={disabled}>
            {t("upload.files")}
          </Button>
        )}
      </FileButton>
      <Button variant="default" disabled={disabled} onClick={() => folderInput.current?.click()}>
        {t("upload.folder")}
      </Button>
      <input
        ref={folderInput}
        type="file"
        multiple
        hidden
        onChange={(event) => {
          startUpload(Array.from(event.currentTarget.files ?? []));
          event.currentTarget.value = "";
        }}
      />
    </Group>
  );
}
