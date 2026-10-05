"use client";

import { useEffect } from "react";
import { RotateCw } from "lucide-react";
import * as Sentry from "@sentry/nextjs";
import { AppShell } from "@/components/app/app-shell";
import { Button, ButtonLink, ErrorState } from "@/components/app/ui";

/**
 * When a member page throws.
 *
 * Only the inbox had a boundary of its own, so every other member page fell
 * through to the global error page, which replaces the whole document: no
 * header, no rail, no way back but the browser. This keeps the frame, says
 * what happened, and offers the one action that usually fixes a transient
 * failure. `digest` ties the render to the server log; the stack stays there.
 */
export default function MemberError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    Sentry.captureException(error, { tags: { area: "member" } });
  }, [error]);

  return (
    <AppShell>
      <ErrorState
        title="This page could not load"
        description="Something failed on our side. Nothing you did was lost, and it is safe to try again."
        digest={error.digest}
        action={
          <>
            <Button variant="primary" onClick={reset}>
              <RotateCw className="size-4" aria-hidden />
              Try again
            </Button>
            <ButtonLink href="/home">Back to Explorer</ButtonLink>
          </>
        }
      />
    </AppShell>
  );
}
