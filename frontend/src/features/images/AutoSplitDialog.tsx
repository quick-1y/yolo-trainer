import { Alert, Button, Group, Modal, NumberInput, Paper, Skeleton, Stack, Text } from "@mantine/core";
import { useDebouncedValue } from "@mantine/hooks";
import { notifications } from "@mantine/notifications";
import { useMemo, useState } from "react";
import { useTranslation } from "react-i18next";

import { ApiError } from "../../api/client";
import {
  type AutoSplitRatios,
  type AutoSplitApplyVariables,
  useApplyAutoSplit,
  useAutoSplitPreview,
} from "../../api/splits";

const PREVIEW_DEBOUNCE_MS = 300;
const DEFAULT_RATIOS = { train: 80, valid: 10, test: 10 };

type RatioInput = number | string;

interface RatioFields {
  train: RatioInput;
  valid: RatioInput;
  test: RatioInput;
}

/** An empty field counts as 0 until the user types a number. */
function toNumber(value: RatioInput): number {
  return typeof value === "number" ? value : 0;
}

function ratioError(ratios: AutoSplitRatios): "sum" | "required" | null {
  if (ratios.train + ratios.valid + ratios.test !== 100) {
    return "sum";
  }
  if (ratios.train === 0 || ratios.valid === 0) {
    return "required";
  }
  return null;
}

function sameRatios(a: AutoSplitRatios, b: AutoSplitRatios): boolean {
  return a.train === b.train && a.valid === b.valid && a.test === b.test;
}

interface AutoSplitBodyProps {
  projectId: number;
  apply: ReturnType<typeof useApplyAutoSplit>;
  /** Cancel: refused while the request runs. */
  onCancel: () => void;
  /** The split was applied: closes regardless of the request state. */
  onDone: () => void;
  onApplied?: () => void;
}

/** Mounted only while the dialog is open, so every opening starts from 80/10/10. */
function AutoSplitBody({ projectId, apply, onCancel, onDone, onApplied }: AutoSplitBodyProps) {
  const { t } = useTranslation(["images", "projects", "common"]);
  const [fields, setFields] = useState<RatioFields>(DEFAULT_RATIOS);
  const train = toNumber(fields.train);
  const valid = toNumber(fields.valid);
  const test = toNumber(fields.test);
  // A stable identity: useDebouncedValue restarts its timer whenever the value changes.
  const ratios = useMemo<AutoSplitRatios>(() => ({ train, valid, test }), [train, valid, test]);
  const [debounced] = useDebouncedValue(ratios, PREVIEW_DEBOUNCE_MS);
  const error = ratioError(ratios);
  const sum = train + valid + test;
  // The preview is requested only for valid ratios the user has stopped changing.
  const settled = sameRatios(ratios, debounced);
  const preview = useAutoSplitPreview(projectId, error === null && settled ? ratios : null);
  const previewData = error === null && settled ? preview.data : undefined;
  const previewError = error === null && settled && preview.error ? preview.error.message : null;
  const loading = error === null && previewData === undefined && previewError === null;
  const applyError = apply.error instanceof ApiError ? apply.error.message : null;
  const canApply =
    error === null &&
    previewData !== undefined &&
    previewData.unassigned_total > 0 &&
    !apply.isPending;

  const handleApply = () => {
    if (!canApply || previewData === undefined) {
      return;
    }
    const variables: AutoSplitApplyVariables = {
      ...ratios,
      seed: previewData.seed,
      expected_unassigned: previewData.unassigned_total,
    };
    apply.mutate(variables, {
      onSuccess: (result) => {
        onDone();
        notifications.show({
          color: "green",
          message: t("images:autoSplit.done", { ...result.counts }),
        });
        onApplied?.();
      },
      onError: (failure) => {
        // The unassigned set changed: show what it is now, so the user reviews it again.
        if (failure instanceof ApiError && failure.status === 409) {
          void preview.refetch();
        }
      },
    });
  };

  const setField = (key: keyof RatioFields) => (value: RatioInput) =>
    setFields((previous) => ({ ...previous, [key]: value }));

  return (
    <Stack gap={16}>
      <Text size="sm">{t("images:autoSplit.body")}</Text>
      <Group gap={8} align="flex-start">
        {(["train", "valid", "test"] as const).map((key, index) => (
          <NumberInput
            key={key}
            w={96}
            label={t(`images:autoSplit.field.${key}`)}
            value={fields[key]}
            onChange={setField(key)}
            min={0}
            max={100}
            allowDecimal={false}
            allowNegative={false}
            clampBehavior="strict"
            suffix="%"
            data-autofocus={index === 0 ? true : undefined}
          />
        ))}
      </Group>
      <Stack gap={4}>
        <Text size="sm" fw={sum === 100 ? undefined : 600} c={sum === 100 ? undefined : "red"}>
          {t("images:autoSplit.total", { sum })}
        </Text>
        {error !== null && (
          <Text size="sm" c="red">
            {t(`images:autoSplit.error.${error}`)}
          </Text>
        )}
      </Stack>
      <Paper bg="dark.6" p={16} radius={8} mih={80}>
        {error === null && (
          <Stack gap={8}>
            {loading ? (
              <>
                <Skeleton h={16} data-testid="auto-split-skeleton" />
                <Skeleton h={16} w="70%" data-testid="auto-split-skeleton" />
              </>
            ) : previewData !== undefined ? (
              <>
                <Text size="sm" fw={600}>
                  {t("images:autoSplit.preview.unassigned", { count: previewData.unassigned_total })}
                </Text>
                <Text size="sm" style={{ fontVariantNumeric: "tabular-nums" }}>
                  {t("images:autoSplit.preview.result", { ...previewData.counts })}
                </Text>
              </>
            ) : null}
          </Stack>
        )}
      </Paper>
      <Text size="xs" c="dark.1">
        {t("images:autoSplit.unannotatedNote")}
      </Text>
      {(applyError ?? previewError) !== null && (
        <Alert color="red" title={t("common:error.title")}>
          {applyError ?? previewError}
        </Alert>
      )}
      <Group justify="flex-end" gap={8}>
        <Button variant="default" disabled={apply.isPending} onClick={onCancel}>
          {t("projects:modal.cancel")}
        </Button>
        <Button disabled={!canApply} loading={apply.isPending} onClick={handleApply}>
          {t("images:autoSplit.apply")}
        </Button>
      </Group>
    </Stack>
  );
}

interface AutoSplitDialogProps {
  projectId: number;
  opened: boolean;
  onClose: () => void;
  /** Called after the split was applied (the dialog has already closed). */
  onApplied?: () => void;
}

/**
 * Split the images that have no split yet by ratio. The dialog is the confirmation (D-03):
 * it shows the exact resulting counts first and applies only the previewed split, so the
 * server can refuse it with a 409 if the unassigned set changed in the meantime.
 */
export function AutoSplitDialog({ projectId, opened, onClose, onApplied }: AutoSplitDialogProps) {
  const { t } = useTranslation("images");
  const apply = useApplyAutoSplit(projectId);
  const pending = apply.isPending;

  const finish = () => {
    apply.reset();
    onClose();
  };
  const handleClose = () => {
    if (!pending) {
      finish();
    }
  };

  return (
    <Modal
      opened={opened}
      onClose={handleClose}
      title={t("autoSplit.title")}
      size={480}
      styles={{ title: { fontSize: 16, fontWeight: 600 } }}
      closeOnEscape={!pending}
      closeOnClickOutside={!pending}
      withCloseButton={!pending}
    >
      <AutoSplitBody
        projectId={projectId}
        apply={apply}
        onCancel={handleClose}
        onDone={finish}
        onApplied={onApplied}
      />
    </Modal>
  );
}
