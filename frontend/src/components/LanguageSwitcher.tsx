import { SegmentedControl } from "@mantine/core";
import { useTranslation } from "react-i18next";

import type { AppLanguage } from "../i18n/language";
import { changeAppLanguage, SUPPORTED_LANGUAGES } from "../i18n/language";

/**
 * Header control (D-01/D-02): lets the user switch the whole UI between
 * English and Russian instantly. Option labels are each language's own
 * autonym (identical in every UI language); the control's own accessible
 * label is translated.
 */
export function LanguageSwitcher() {
  const { t, i18n } = useTranslation("common");

  const data = SUPPORTED_LANGUAGES.map((lng) => ({
    value: lng,
    label: t(`language.${lng}`),
  }));

  return (
    <SegmentedControl
      size="xs"
      aria-label={t("language.label")}
      value={i18n.language}
      onChange={(value) => {
        void changeAppLanguage(value as AppLanguage);
      }}
      data={data}
    />
  );
}
