"use client";

import { useEffect } from "react";
import { RotateCw } from "lucide-react";
import * as Sentry from "@sentry/nextjs";
import { Button, ButtonLink, ErrorState } from "@/components/app/ui";
import { PaneBackLink, PaneHeader } from "@/components/messages/pane-header";

/**
 * When a thread or the picker cannot load.
 *
 * Caught inside the messages frame, so the inbox stays where it is and only
 * the pane beside it says what happened. Loading a thread never writes, so
 * trying again is always safe.
 */
export default function MessagesError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    Sentry.captureException(error, { tags: { area: "messages" } });
  }, [error]);

  return (
    <section className="flex h-full min-h-0 flex-col bg-surface">
      <PaneHeader>
        <PaneBackLink />
        <h1 className="truncate text-title font-semibold text-foreground">Messages</h1>
      </PaneHeader>
      <div className="flex min-h-0 flex-1 items-center justify-center overflow-y-auto p-4 sm:p-6">
        <ErrorState
          title="Messages could not load"
          description="Something failed on our side. It is safe to try again."
          digest={error.digest}
          className="w-full max-w-md"
          action={
            <>
              <Button variant="primary" onClick={reset}>
                <RotateCw className="size-4" aria-hidden />
                Try again
              </Button>
              <ButtonLink href="/messages">Back to messages</ButtonLink>
            </>
          }
        />
      </div>
    </section>
  );
}
