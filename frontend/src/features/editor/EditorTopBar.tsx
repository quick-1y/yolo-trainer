import { Button, Loader, Text, Tooltip } from "@mantine/core";
import { useTranslation } from "react-i18next";
import { useNavigate, useSearchParams } from "react-router-dom";
import { useStore } from "zustand";

import type { EditorStore, SaveState } from "./store/annotationStore";
import { imagesPath, readGridParams } from "./lib/urls";

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
  filename: string;
  store: EditorStore;
}

/** The 48 px bar: Back, the filename and the save indicator. */
export function EditorTopBar({ projectId, filename, store }: EditorTopBarProps) {
  const { t } = useTranslation("editor");
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const saveState = useStore(store, (state) => state.meta.saveState);

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
        onClick={() => navigate(imagesPath(projectId, readGridParams(searchParams)))}
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
    </div>
  );
}
