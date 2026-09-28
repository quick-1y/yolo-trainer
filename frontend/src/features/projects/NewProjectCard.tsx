import { Card, Center, Stack, Text } from "@mantine/core";
import { useState } from "react";
import { useTranslation } from "react-i18next";

import { CreateProjectModal } from "./CreateProjectModal";

export function NewProjectCard() {
  const { t } = useTranslation("projects");
  const [opened, setOpened] = useState(false);

  return (
    <>
      <Card
        withBorder
        padding="lg"
        radius="md"
        h="100%"
        style={{ borderStyle: "dashed", cursor: "pointer" }}
        onClick={() => setOpened(true)}
        role="button"
        tabIndex={0}
        onKeyDown={(event) => {
          if (event.key === "Enter" || event.key === " ") {
            setOpened(true);
          }
        }}
      >
        <Center h="100%" mih={100}>
          <Stack align="center" gap={4}>
            <Text size="xl">+</Text>
            <Text fw={500}>{t("newProjectCard.label")}</Text>
          </Stack>
        </Center>
      </Card>
      <CreateProjectModal opened={opened} onClose={() => setOpened(false)} />
    </>
  );
}
