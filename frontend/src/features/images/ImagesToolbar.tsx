import { CloseButton, Group, SegmentedControl, TextInput } from "@mantine/core";
import { useDebouncedValue } from "@mantine/hooks";
import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";

import type { ImageSort } from "../../api/images";

const SEARCH_DEBOUNCE_MS = 300;

interface ImagesToolbarProps {
  /** Committed (debounced) search text owned by the page. */
  search: string;
  onSearchChange: (value: string) => void;
  sort: ImageSort;
  onSortChange: (value: ImageSort) => void;
}

/**
 * Filename search (debounced 300 ms, cleared by Esc or the X button) and the
 * newest-first / by-filename toggle. The text box keeps its own value so typing
 * is instant; only the debounced value reaches the page and the API.
 */
export function ImagesToolbar({ search, onSearchChange, sort, onSortChange }: ImagesToolbarProps) {
  const { t } = useTranslation("images");
  const [text, setText] = useState(search);
  const [debounced] = useDebouncedValue(text, SEARCH_DEBOUNCE_MS);

  useEffect(() => {
    onSearchChange(debounced);
    // onSearchChange is a stable state setter; the debounced value is the trigger.
  }, [debounced]);

  useEffect(() => {
    // The page resets the search (No matching images -> Clear search).
    if (search === "") {
      setText("");
    }
  }, [search]);

  const clear = () => {
    setText("");
    onSearchChange("");
  };

  return (
    <Group gap={8} mb="md">
      <TextInput
        w={320}
        value={text}
        placeholder={t("search.placeholder")}
        aria-label={t("search.placeholder")}
        onChange={(event) => setText(event.currentTarget.value)}
        onKeyDown={(event) => {
          if (event.key === "Escape") {
            clear();
          }
        }}
        rightSection={
          text === "" ? null : (
            <CloseButton size="sm" aria-label={t("search.clear")} onClick={clear} />
          )
        }
      />
      <SegmentedControl
        value={sort}
        onChange={(value) => onSortChange(value as ImageSort)}
        data={[
          { value: "newest", label: t("sort.newest") },
          { value: "name", label: t("sort.name") },
        ]}
      />
    </Group>
  );
}
