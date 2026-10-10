import {
  Alert,
  Button,
  Group,
  NumberInput,
  SegmentedControl,
  Select,
  Skeleton,
  Stack,
  Text,
  TextInput,
  Title,
} from "@mantine/core";
import { useMediaQuery } from "@mantine/hooks";
import { useId, useRef, useState } from "react";
import type { FormEvent } from "react";
import { useTranslation } from "react-i18next";
import { Link, useNavigate, useOutletContext } from "react-router-dom";

import { ApiError } from "../../api/client";
import type { Project } from "../../api/projects";
import { useCreateRun, useTrainingOptions } from "../../api/training";
import type {
  DeviceChoice,
  RunBaseInput,
  TrainedModelOption,
  TrainingOptions,
} from "../../api/training";
import { AutoSplitDialog } from "../images/AutoSplitDialog";
import { DatasetNotes } from "./DatasetNotes";
import { DatasetSummary } from "./DatasetSummary";

interface ProjectOutletContext {
  project: Project;
}

/** The viewport width from which the form and the dataset summary sit side by side. */
const WIDE_LAYOUT_QUERY = "(min-width: 1200px)";
const SUMMARY_WIDTH = 320;
const LAYOUT_GAP = 24;
/** Option values of models trained here are `model:<id>`; official ones are the model name. */
const TRAINED_PREFIX = "model:";

function trainedValue(model: TrainedModelOption): string {
  return `${TRAINED_PREFIX}${model.id}`;
}

function trainedLabel(model: TrainedModelOption): string {
  return model.project_name ? `${model.name} · ${model.project_name}` : model.name;
}

function baseInput(value: string): RunBaseInput {
  return value.startsWith(TRAINED_PREFIX)
    ? { kind: "model", model_id: Number(value.slice(TRAINED_PREFIX.length)) }
    : { kind: "official", name: value };
}

// Mirror the server's RunCreate bounds (schemas.RunCreate). Client rules are UX only; the
// server stays the authority (T4-02-03).
const MAX_NAME_LENGTH = 100;
const EPOCHS_MIN = 1;
const EPOCHS_MAX = 1000;
const IMGSZ_MIN = 32;
const IMGSZ_MAX = 2048;
const IMGSZ_STEP = 32;
const BATCH_MIN = 1;
const BATCH_MAX = 512;
const DEFAULT_CUSTOM_BATCH = 16;
const AUTO_BATCH = -1;

type FieldKey = "name" | "epochs" | "imgsz" | "batch";
type FieldErrors = Partial<Record<FieldKey, string>>;
type NumberValue = number | string;

function isWholeNumberIn(value: NumberValue, min: number, max: number): value is number {
  return typeof value === "number" && Number.isInteger(value) && value >= min && value <= max;
}

export function NewRunPage() {
  const { t } = useTranslation(["training", "common"]);
  const { project } = useOutletContext<ProjectOutletContext>();
  const options = useTrainingOptions(project.id);
  const wide = useMediaQuery(WIDE_LAYOUT_QUERY);
  const [splitOpened, setSplitOpened] = useState(false);
  const listPath = `/projects/${project.id}/training`;
  const openSplit = () => setSplitOpened(true);

  const loadError =
    options.data === undefined && options.isError
      ? options.error instanceof ApiError
        ? options.error.message
        : String(options.error)
      : null;

  const formColumn =
    options.data !== undefined ? (
      <NewRunForm
        key="form"
        projectId={project.id}
        options={options.data}
        listPath={listPath}
        onAutoSplit={openSplit}
      />
    ) : loadError !== null ? (
      <Stack key="form" gap={16} maw={560}>
        <ButtonRow listPath={listPath} startDisabled />
      </Stack>
    ) : (
      <Stack key="form" gap={16} maw={560} data-testid="newrun-loading">
        {[0, 1, 2, 3, 4, 5].map((key) => (
          <Skeleton key={key} height={56} radius={8} />
        ))}
        <ButtonRow listPath={listPath} startDisabled />
      </Stack>
    );

  const summaryColumn = (
    <DatasetSummary
      key="summary"
      projectId={project.id}
      summary={options.data?.summary}
      error={loadError}
      onRetry={() => void options.refetch()}
      onAutoSplit={openSplit}
    />
  );

  // Keyed siblings keep their state when the order flips at the breakpoint. Below it the
  // summary comes first, so blockers are seen before the form is filled in.
  return (
    <Stack gap={24} maw={960}>
      <div>
        <Button component={Link} to={listPath} variant="subtle" size="compact-sm">
          {`← ${t("training:newRun.back")}`}
        </Button>
      </div>
      <Title order={2}>{t("training:newRun.title")}</Title>
      <div
        data-testid="newrun-layout"
        style={{
          display: "grid",
          gridTemplateColumns: wide ? `minmax(0, 1fr) ${SUMMARY_WIDTH}px` : "minmax(0, 1fr)",
          gap: LAYOUT_GAP,
          alignItems: "start",
        }}
      >
        {wide ? [formColumn, summaryColumn] : [summaryColumn, formColumn]}
      </div>
      <AutoSplitDialog
        projectId={project.id}
        opened={splitOpened}
        onClose={() => setSplitOpened(false)}
      />
    </Stack>
  );
}

interface ButtonRowProps {
  listPath: string;
  startDisabled: boolean;
  pending?: boolean;
}

function ButtonRow({ listPath, startDisabled, pending = false }: ButtonRowProps) {
  const { t } = useTranslation("training");
  return (
    <Group gap={8}>
      <Button type="submit" disabled={startDisabled || pending} loading={pending}>
        {t("newRun.submit")}
      </Button>
      <Button variant="default" component={Link} to={listPath}>
        {t("newRun.cancel")}
      </Button>
    </Group>
  );
}

interface NewRunFormProps {
  projectId: number;
  options: TrainingOptions;
  listPath: string;
  onAutoSplit: () => void;
}

function NewRunForm({ projectId, options, listPath, onAutoSplit }: NewRunFormProps) {
  const { t, i18n } = useTranslation(["training", "common"]);
  const navigate = useNavigate();
  const createRun = useCreateRun(projectId);
  const batchLabelId = useId();

  const [name, setName] = useState(options.next_run_name);
  const [base, setBase] = useState(options.default_base);
  const [epochs, setEpochs] = useState<NumberValue>(options.defaults.epochs);
  const [imgsz, setImgsz] = useState<NumberValue>(options.defaults.imgsz);
  const [batchMode, setBatchMode] = useState<"auto" | "custom">(
    options.defaults.batch === AUTO_BATCH ? "auto" : "custom",
  );
  const [customBatch, setCustomBatch] = useState<NumberValue>(
    options.defaults.batch === AUTO_BATCH ? DEFAULT_CUSTOM_BATCH : options.defaults.batch,
  );
  const [device, setDevice] = useState<DeviceChoice>(options.defaults.device);
  const [errors, setErrors] = useState<FieldErrors>({});
  const [nameConflict, setNameConflict] = useState<string | null>(null);
  const [submitError, setSubmitError] = useState<string | null>(null);

  // A ref (not state) so a rapid repeat click is blocked synchronously, before React
  // commits the re-render that disables the button (T-03-04 pattern).
  const isSubmittingRef = useRef(false);

  const gpus = options.devices.gpus;
  const sizeByModel = new Map(options.official.map((model) => [model.name, model.size]));
  const trainedByValue = new Map(options.models.map((model) => [trainedValue(model), model]));
  const selectedModel = trainedByValue.get(base);
  const map50Format = new Intl.NumberFormat(i18n.language, {
    minimumFractionDigits: 3,
    maximumFractionDigits: 3,
  });
  const baseData = [
    {
      group: t("training:newRun.base.official"),
      items: options.official.map((model) => ({ value: model.name, label: model.name })),
    },
    ...(options.models.length > 0
      ? [
          {
            group: t("training:newRun.base.trained"),
            items: options.models.map((model) => ({
              value: trainedValue(model),
              label: trainedLabel(model),
            })),
          },
        ]
      : []),
  ];
  const resolvedCpu = device === "cpu" || (device === "auto" && gpus.length === 0);

  function validateField(field: FieldKey): string | undefined {
    switch (field) {
      case "name": {
        const trimmed = name.trim();
        if (trimmed === "") {
          return t("training:newRun.validation.name.required");
        }
        // Code points, like the server's len() on the trimmed name.
        if (Array.from(trimmed).length > MAX_NAME_LENGTH) {
          return t("training:newRun.validation.name.tooLong");
        }
        return undefined;
      }
      case "epochs":
        return isWholeNumberIn(epochs, EPOCHS_MIN, EPOCHS_MAX)
          ? undefined
          : t("training:newRun.validation.epochs");
      case "imgsz":
        return isWholeNumberIn(imgsz, IMGSZ_MIN, IMGSZ_MAX) && imgsz % IMGSZ_STEP === 0
          ? undefined
          : t("training:newRun.validation.imgsz");
      case "batch":
        if (batchMode === "auto") {
          return undefined;
        }
        return isWholeNumberIn(customBatch, BATCH_MIN, BATCH_MAX)
          ? undefined
          : t("training:newRun.validation.batch");
    }
  }

  function setFieldError(field: FieldKey, message: string | undefined) {
    setErrors((current) => {
      const next = { ...current };
      if (message === undefined) {
        delete next[field];
      } else {
        next[field] = message;
      }
      return next;
    });
  }

  function handleSubmit(event: FormEvent) {
    event.preventDefault();
    if (isSubmittingRef.current) {
      return;
    }

    const found: FieldErrors = {};
    for (const field of ["name", "epochs", "imgsz", "batch"] as const) {
      const message = validateField(field);
      if (message !== undefined) {
        found[field] = message;
      }
    }
    setErrors(found);
    if (Object.keys(found).length > 0) {
      return;
    }

    isSubmittingRef.current = true;
    setNameConflict(null);
    setSubmitError(null);
    createRun.mutate(
      {
        name: name.trim(),
        base: baseInput(base),
        epochs: epochs as number,
        imgsz: imgsz as number,
        batch: batchMode === "auto" ? AUTO_BATCH : (customBatch as number),
        device,
      },
      {
        onSuccess: (created) => {
          void navigate(`${listPath}/${created.id}`);
        },
        onError: (error) => {
          isSubmittingRef.current = false;
          if (error instanceof ApiError && error.status === 409) {
            setNameConflict(error.message);
          } else {
            setSubmitError(error instanceof ApiError ? error.message : String(error));
          }
        },
      },
    );
  }

  const deviceData = [
    { value: "auto", label: t("training:newRun.device.auto") },
    { value: "cpu", label: t("training:newRun.device.cpu") },
    ...gpus.map((gpu) => ({
      value: "0",
      label: t("training:newRun.device.gpu", { index: gpu.index, name: gpu.name }),
    })),
  ];

  return (
    <form onSubmit={handleSubmit} noValidate data-testid="newrun-form">
      <Stack gap={16} maw={560}>
        <TextInput
          label={t("training:newRun.name.label")}
          description={t("training:newRun.name.hint")}
          inputWrapperOrder={["label", "input", "description", "error"]}
          maxLength={MAX_NAME_LENGTH}
          value={name}
          error={errors.name ?? nameConflict ?? undefined}
          onChange={(event) => {
            setName(event.currentTarget.value);
            setNameConflict(null);
            if (errors.name !== undefined) {
              setFieldError("name", undefined);
            }
          }}
          onBlur={() => setFieldError("name", validateField("name"))}
        />
        <Select
          label={t("training:newRun.base.label")}
          data={baseData}
          value={base}
          onChange={(value) => value !== null && setBase(value)}
          allowDeselect={false}
          searchable={false}
          comboboxProps={{ withinPortal: true }}
          renderOption={({ option }) => {
            const trained = trainedByValue.get(option.value);
            if (trained !== undefined) {
              // Long names truncate; the full label stays available as the option title.
              return (
                <Stack gap={0} miw={0} title={option.label}>
                  <Text size="sm" truncate="end">
                    {option.label}
                  </Text>
                  <Text size="xs" c="dark.1" truncate="end">
                    {t("training:newRun.base.trainedMeta", {
                      map50: trained.map50 === null ? "—" : map50Format.format(trained.map50),
                      classes: trained.class_count,
                    })}
                  </Text>
                </Stack>
              );
            }
            return (
              <Stack gap={0}>
                <Text size="sm">{option.label}</Text>
                <Text size="xs" c="dark.1">
                  {t(`training:newRun.base.size.${sizeByModel.get(option.value) ?? "n"}`)}
                </Text>
              </Stack>
            );
          }}
        />
        {selectedModel !== undefined && !selectedModel.classes_match ? (
          <Alert color="yellow" variant="light" data-testid="classes-differ">
            <Text size="sm">{t("training:newRun.base.classesDiffer")}</Text>
          </Alert>
        ) : null}
        <NumberInput
          label={t("training:newRun.epochs.label")}
          description={t("training:newRun.epochs.hint")}
          inputWrapperOrder={["label", "input", "description", "error"]}
          value={epochs}
          min={EPOCHS_MIN}
          max={EPOCHS_MAX}
          step={1}
          allowDecimal={false}
          allowNegative={false}
          clampBehavior="none"
          error={errors.epochs}
          onChange={(value) => {
            setEpochs(value);
            if (errors.epochs !== undefined) {
              setFieldError("epochs", undefined);
            }
          }}
          onBlur={() => setFieldError("epochs", validateField("epochs"))}
        />
        <NumberInput
          label={t("training:newRun.imgsz.label")}
          description={t("training:newRun.imgsz.hint")}
          inputWrapperOrder={["label", "input", "description", "error"]}
          value={imgsz}
          min={IMGSZ_MIN}
          max={IMGSZ_MAX}
          step={IMGSZ_STEP}
          allowDecimal={false}
          allowNegative={false}
          clampBehavior="none"
          error={errors.imgsz}
          onChange={(value) => {
            setImgsz(value);
            if (errors.imgsz !== undefined) {
              setFieldError("imgsz", undefined);
            }
          }}
          onBlur={() => setFieldError("imgsz", validateField("imgsz"))}
        />
        <Stack gap={4}>
          <Text id={batchLabelId} size="sm" fw={600}>
            {t("training:newRun.batch.label")}
          </Text>
          <SegmentedControl
            size="sm"
            aria-labelledby={batchLabelId}
            value={batchMode}
            onChange={(value) => {
              setBatchMode(value as "auto" | "custom");
              setFieldError("batch", undefined);
            }}
            data={[
              { value: "auto", label: t("training:newRun.batch.auto") },
              { value: "custom", label: t("training:newRun.batch.custom") },
            ]}
          />
          {batchMode === "custom" ? (
            <NumberInput
              mt={4}
              aria-label={t("training:newRun.batch.label")}
              value={customBatch}
              min={BATCH_MIN}
              max={BATCH_MAX}
              step={1}
              allowDecimal={false}
              allowNegative={false}
              clampBehavior="none"
              error={errors.batch}
              onChange={(value) => {
                setCustomBatch(value);
                if (errors.batch !== undefined) {
                  setFieldError("batch", undefined);
                }
              }}
              onBlur={() => setFieldError("batch", validateField("batch"))}
            />
          ) : null}
          <Text size="xs" c="dark.1">
            {t("training:newRun.batch.hint")}
          </Text>
        </Stack>
        <Select
          label={t("training:newRun.device.label")}
          inputWrapperOrder={["label", "input", "description", "error"]}
          description={
            gpus.length === 0 || resolvedCpu ? (
              <>
                {gpus.length === 0 ? (
                  <span style={{ display: "block" }}>{t("training:newRun.device.noGpu")}</span>
                ) : null}
                {resolvedCpu ? (
                  <span style={{ display: "block" }}>{t("training:newRun.device.cpuHint")}</span>
                ) : null}
              </>
            ) : undefined
          }
          data={deviceData}
          value={device}
          onChange={(value) => value !== null && setDevice(value as DeviceChoice)}
          allowDeselect={false}
          searchable={false}
          comboboxProps={{ withinPortal: true }}
        />
        <DatasetNotes
          projectId={projectId}
          blockers={options.blockers}
          warnings={options.warnings}
          unassigned={options.summary.unassigned}
          onAutoSplit={onAutoSplit}
        />
        {submitError !== null ? (
          <Alert color="red" title={t("common:error.title")}>
            {submitError}
          </Alert>
        ) : null}
        <ButtonRow
          listPath={listPath}
          startDisabled={options.blockers.length > 0}
          pending={createRun.isPending}
        />
      </Stack>
    </form>
  );
}
