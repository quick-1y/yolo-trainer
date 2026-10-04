import { ActionIcon, Button, Divider, Loader, Text, Tooltip } from "@mantine/core";
import { useTranslation } from "react-i18next";
import { useSearchParams } from "react-router-dom";
import { useStore } from "zustand";

import { useNeighbors } from "../../api/images";
import type { EditorStore, SaveState } from "./store/annotationStore";
import { editorPath, imagesPath, readGridParams } from "./lib/urls";
import type { EditorNavigation } from "./useEditorNavigation";

/** Same 120 px slot for every state, so the bar never shifts when the state changes. */
const INDICATOR_WIDTH = 120;

function SaveIndicator({ state }: { state: SaveState }) {
  const { t } = useTranslation("editor");
  const failed = state === "error" || state === "conflict";
  const hint = t("save.errorHint");

  return (
    <Tooltip label={hint} disabled={!failed} openDelay={400}>
      <div
        role="status"
        aria-live={failed ? "polite" : "off"}
        aria-label={failed ? hint : undefined}
        style={{
          width: INDICATOR_WIDTH,
          flexShrink: 0,
          display: "flex",
          alignItems: "center",
          gap: 8,
          fontSize: 12,
          lineHeight: 1.4,
          color: failed ? "var(--mantine-color-red-4)" : "var(--mantine-color-dark-1)",
          whiteSpace: "nowrap",
        }}
      >
        {state === "saving" ? (
          <Loader size={12} color="gray" />
        ) : (
          <span
            aria-hidden
            style={{
              width: 8,
              height: 8,
              borderRadius: "50%",
              flexShrink: 0,
              background: failed ? "var(--mantine-color-red-6)" : "var(--mantine-color-green-6)",
            }}
          />
        )}
        <span>
          {state === "saved" && t("save.saved")}
          {state === "saving" && t("save.saving")}
          {failed && t("save.error")}
        </span>
      </div>
    </Tooltip>
  );
}

interface EditorTopBarProps {
  projectId: number;
  imageId: number;
  filename: string;
  store: EditorStore;
  /** Every move out of the image, through the saver flush. */
  navigation: EditorNavigation;
}

/** The 48 px bar: Back, the filename, the save indicator and the previous / next arrows. */
export function EditorTopBar({
  projectId,
  imageId,
  filename,
  store,
  navigation,
}: EditorTopBarProps) {
  const { t } = useTranslation("editor");
  const [searchParams] = useSearchParams();
  const saveState = useStore(store, (state) => state.meta.saveState);
  const grid = readGridParams(searchParams);
  // The same query as the editor page's: one request, shared through the cache.
  const neighbors = useNeighbors(projectId, imageId, grid.sort, grid.q).data;
  const { goTo, pending } = navigation;
  const prevId = neighbors?.prev_id ?? null;
  const nextId = neighbors?.next_id ?? null;

  return (
    <div
      style={{
        gridColumn: "1 / -1",
        height: 48,
        display: "flex",
        alignItems: "center",
        gap: 8,
        padding: "0 16px",
        background: "var(--mantine-color-dark-7)",
        borderBottom: "1px solid var(--mantine-color-dark-4)",
        minWidth: 0,
      }}
    >
      <Button
        variant="subtle"
        size="sm"
        aria-label={t("topBar.backAria")}
        style={{ flexShrink: 0 }}
        loading={pending === "back"}
        onClick={() => void goTo(imagesPath(projectId, grid), "back")}
      >
        {`← ${t("topBar.back")}`}
      </Button>
      <Text
        size="md"
        fw={600}
        truncate="end"
        title={filename}
        style={{ maxWidth: "30%", minWidth: 120, flexShrink: 1 }}
      >
        {filename}
      </Text>
      <SaveIndicator state={saveState} />
      <div style={{ flex: 1 }} />
      <Divider orientation="vertical" h={24} />
      <ActionIcon
        variant="default"
        size={32}
        aria-label={t("topBar.prevAria")}
        disabled={prevId === null}
        loading={pending === "prev"}
        onClick={() => prevId !== null && void goTo(editorPath(projectId, prevId, grid), "prev")}
      >
        ‹
      </ActionIcon>
      {neighbors?.position != null && (
        <Text
          span
          size="xs"
          c="dark.1"
          style={{ fontVariantNumeric: "tabular-nums", whiteSpace: "nowrap", flexShrink: 0 }}
        >
          {t("topBar.position", { index: neighbors.position, total: neighbors.total })}
        </Text>
      )}
      <ActionIcon
        variant="default"
        size={32}
        aria-label={t("topBar.nextAria")}
        disabled={nextId === null}
        loading={pending === "next"}
        onClick={() => nextId !== null && void goTo(editorPath(projectId, nextId, grid), "next")}
      >
        ›
      </ActionIcon>
    </div>
  );
}
