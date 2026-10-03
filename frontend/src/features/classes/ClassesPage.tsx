import {
  Alert,
  Box,
  Button,
  EmptyState,
  Group,
  Paper,
  Skeleton,
  Stack,
  Text,
  Title,
} from "@mantine/core";
import { useTranslation } from "react-i18next";
import { useOutletContext } from "react-router-dom";

import { useClasses } from "../../api/classes";
import { ApiError } from "../../api/client";
import type { Project } from "../../api/projects";
import { AddClassForm } from "./AddClassForm";
import { ClassRow } from "./ClassRow";

interface ProjectOutletContext {
  project: Project;
}

// Classes are listed without pagination or virtualization (expected under
// about 200); the page scrolls normally. There is deliberately no drag handle
// or reorder control: indices follow creation order (D-14).
export function ClassesPage() {
  const { t } = useTranslation(["classes", "common"]);
  const { project } = useOutletContext<ProjectOutletContext>();
  const classes = useClasses(project.id);
  const items = classes.data ?? [];

  return (
    <Stack gap={16}>
      <Group align="baseline" gap={8}>
        <Title order={2}>{t("classes:page.title")}</Title>
        <Text size="sm" c="dark.1">
          {t("classes:page.count", { count: items.length })}
        </Text>
      </Group>
      <Text size="sm" c="dark.1">
        {t("classes:page.indexHint")}
      </Text>
      <AddClassForm projectId={project.id} />
      {classes.isPending ? (
        <Stack gap={8} data-testid="classes-loading">
          {[0, 1, 2].map((key) => (
            <Skeleton key={key} height={48} radius={8} />
          ))}
        </Stack>
      ) : classes.isError ? (
        <Alert color="red" title={t("common:error.title")}>
          <Stack gap={8} align="flex-start">
            <Text size="sm">
              {classes.error instanceof ApiError ? classes.error.message : String(classes.error)}
            </Text>
            <Button
              variant="light"
              color="red"
              size="compact-sm"
              onClick={() => void classes.refetch()}
            >
              {t("common:retry")}
            </Button>
          </Stack>
        </Alert>
      ) : items.length === 0 ? (
        <EmptyState
          title={t("classes:emptyState.title")}
          description={t("classes:emptyState.body")}
          py={48}
        />
      ) : (
        <Paper radius={8} style={{ background: "var(--mantine-color-dark-6)", overflow: "hidden" }}>
          <Box
            style={{
              display: "flex",
              alignItems: "center",
              gap: 8,
              height: 32,
              padding: "0 16px",
              borderBottom: "1px solid var(--mantine-color-dark-4)",
            }}
          >
            <Text size="xs" c="dark.1" style={{ width: 48, flexShrink: 0 }}>
              {t("classes:columns.index")}
            </Text>
            <Text size="xs" c="dark.1" style={{ width: 24, flexShrink: 0 }}>
              {t("classes:columns.color")}
            </Text>
            <Text size="xs" c="dark.1" style={{ flex: 1 }}>
              {t("classes:columns.name")}
            </Text>
          </Box>
          {items.map((item, position) => (
            <ClassRow key={item.id} item={item} isFirst={position === 0} />
          ))}
        </Paper>
      )}
    </Stack>
  );
}
