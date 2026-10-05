"use client";

import { useEffect } from "react";
import { RotateCw } from "lucide-react";
import * as Sentry from "@sentry/nextjs";
import { Button, ErrorState } from "@/components/app/ui";

/**
 * When a console page throws.
 *
 * The admin area had no error boundary, so a failed query rendered a blank
 * screen and the reader had no way to tell a broken page from an empty one.
 * That is a bad trade anywhere and a worse one here, where the next thing
 * somebody does might be refunding a member.
 *
 * It says what happened, offers the one action that usually fixes a transient
 * database blip, and does not show the stack — `digest` is the handle that ties
 * this render to the server log.
 */
export default function AdminError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error("[admin]", error);
    Sentry.captureException(error, { tags: { area: "admin" } });
  }, [error]);

  return (
    <ErrorState
      title="This page could not load"
      description="Something failed on the way to the database. Nothing was changed by this, so it is safe to try again."
      digest={error.digest}
      action={
        <Button variant="primary" onClick={reset}>
          <RotateCw className="size-4" aria-hidden />
          Try again
        </Button>
      }
    />
  );
}
