"use client";

import { EmptyState as HeroEmptyState } from "@heroui/react/empty-state";
import { ButtonLink } from "@/components/ui/button";

export function EmptyState({
  title,
  body,
  actionLabel,
  actionHref,
}: {
  title: string;
  body: string;
  actionLabel?: string;
  actionHref?: string;
}) {
  return (
    <HeroEmptyState className="rounded-xl border border-dashed border-border bg-surface px-6 py-12 text-center">
      <h2 className="font-display text-2xl text-primary">{title}</h2>
      <p className="prose-measure mx-auto mt-3 text-foreground-muted">{body}</p>
      {actionLabel && actionHref ? (
        <ButtonLink href={actionHref} className="mt-6">
          {actionLabel}
        </ButtonLink>
      ) : null}
    </HeroEmptyState>
  );
}
