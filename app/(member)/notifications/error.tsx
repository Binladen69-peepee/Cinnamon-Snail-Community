"use client";

import { useEffect } from "react";
import { RotateCw } from "lucide-react";
import * as Sentry from "@sentry/nextjs";
import { AppShell } from "@/components/app/app-shell";
import { Button, ButtonLink, ErrorState } from "@/components/app/ui";

/**
 * When the inbox cannot load.
 *
 * Says so plainly and offers a retry. Nothing was read or changed by the
 * failure — loading the inbox never writes — so retrying is always safe.
 */
export default function NotificationsError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    Sentry.captureException(error, { tags: { area: "notifications" } });
  }, [error]);

  return (
    <AppShell>
      <ErrorState
        title="Notifications could not load"
        description="Nothing was marked read. Try again in a moment."
        digest={error.digest}
        action={
          <>
            <Button variant="primary" onClick={reset}>
              <RotateCw className="size-4" aria-hidden />
              Try again
            </Button>
            <ButtonLink href="/kitchen-table">Back to the Kitchen Table</ButtonLink>
          </>
        }
      />
    </AppShell>
  );
}
