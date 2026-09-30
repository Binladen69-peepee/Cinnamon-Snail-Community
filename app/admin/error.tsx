"use client";

import { useEffect } from "react";
import { AlertTriangle, RotateCw } from "lucide-react";
import * as Sentry from "@sentry/nextjs";

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
    <div className="grid min-h-[60vh] place-items-center px-4">
      <div className="vu-raise w-full max-w-[44ch] rounded-card border border-border bg-surface p-6 text-center">
        <span className="mx-auto grid size-11 place-items-center rounded-full bg-danger/12 text-danger">
          <AlertTriangle className="size-5" aria-hidden />
        </span>
        <h1 className="mt-3 font-display text-[1.15rem] font-bold text-foreground">
          This page could not load
        </h1>
        <p className="mt-1.5 text-[13px] leading-snug text-foreground-muted">
          Something failed on the way to the database. Nothing was changed by
          this, so it is safe to try again.
        </p>
        <button
          type="button"
          onClick={reset}
          className="vu-btn vu-btn-primary mt-4 inline-flex h-9 items-center gap-1.5 px-3.5 text-[13px]"
        >
          <RotateCw className="size-3.5" aria-hidden />
          Try again
        </button>
        {error.digest ? (
          <p className="mt-3 text-[11px] tabular-nums text-foreground-muted">
            Reference {error.digest}
          </p>
        ) : null}
      </div>
    </div>
  );
}
