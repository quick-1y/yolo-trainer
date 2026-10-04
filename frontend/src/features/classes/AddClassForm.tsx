import { Box, Button, Group, TextInput } from "@mantine/core";
import { useRef, useState } from "react";
import type { FormEvent } from "react";
import { useTranslation } from "react-i18next";

import { type ProjectClassItem, useCreateClass } from "../../api/classes";
import { ApiError } from "../../api/client";

// Mirrors the server-side limit (schemas.ClassName) - client rules are UX
// only, the server stays the authority.
const MAX_NAME_LENGTH = 100;

interface AddClassFormProps {
  projectId: number;
  /** Called with the server's answer after a class was created (the Classes page does not use it). */
  onCreated?: (created: ProjectClassItem) => void;
}

export function AddClassForm({ projectId, onCreated }: AddClassFormProps) {
  const { t } = useTranslation(["classes"]);
  const createClass = useCreateClass(projectId);
  const [name, setName] = useState("");
  const [error, setError] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  // Enter can fire again before React re-renders with `isPending`, so a ref
  // is the lock that actually prevents a double submit.
  const submitting = useRef(false);

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    if (submitting.current) {
      return;
    }
    const trimmed = name.trim();
    if (trimmed === "") {
      setError(t("classes:validation.nameRequired"));
      return;
    }
    // Count Unicode code points, matching the server's `len()` on the name.
    if (Array.from(trimmed).length > MAX_NAME_LENGTH) {
      setError(t("classes:validation.nameTooLong"));
      return;
    }
    setError(null);
    submitting.current = true;
    try {
      const created = await createClass.mutateAsync({ name: trimmed });
      setName("");
      inputRef.current?.focus();
      onCreated?.(created);
    } catch (caught) {
      // Keep the typed value so the user can correct it.
      setError(caught instanceof ApiError ? caught.message : String(caught));
    } finally {
      submitting.current = false;
    }
  }

  return (
    <Box component="form" onSubmit={(event) => void handleSubmit(event)} noValidate>
      <Group gap={8} align="flex-end" wrap="nowrap">
        <TextInput
          ref={inputRef}
          label={t("classes:add.label")}
          placeholder={t("classes:add.placeholder")}
          maxLength={MAX_NAME_LENGTH}
          value={name}
          error={error}
          onChange={(event) => {
            setName(event.currentTarget.value);
            if (error !== null) {
              setError(null);
            }
          }}
          style={{ flex: 1 }}
        />
        <Button type="submit" loading={createClass.isPending}>
          {t("classes:add.submit")}
        </Button>
      </Group>
    </Box>
  );
}
