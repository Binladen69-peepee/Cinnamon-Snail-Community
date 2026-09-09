"use client";

import { Alert } from "@heroui/react/alert";

export function ErrorState({
  title = "Something went wrong",
  body = "We could not finish that just now. You can retry, or come back in a moment.",
}: {
  title?: string;
  body?: string;
}) {
  return (
    <Alert status="danger" className="rounded-xl border border-border">
      <Alert.Content>
        <Alert.Title className="font-display text-2xl">{title}</Alert.Title>
        <Alert.Description className="text-foreground-muted">{body}</Alert.Description>
      </Alert.Content>
    </Alert>
  );
}
