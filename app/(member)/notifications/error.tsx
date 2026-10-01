"use client";

import { useEffect } from "react";
import Link from "next/link";
import { AlertTriangle, RotateCw } from "lucide-react";
import * as Sentry from "@sentry/nextjs";

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
    <div className="mx-auto grid min-h-[50vh] w-full max-w-170 place-items-center px-3 py-4 sm:px-5">
      <div className="w-full max-w-[44ch] rounded-card border border-border bg-surface p-6 text-center">
        <span className="mx-auto grid size-11 place-items-center rounded-full bg-danger/12 text-danger">
          <AlertTriangle className="size-5" aria-hidden />
        </span>
        <h1 className="mt-3 font-display text-[1.15rem] font-bold text-foreground">
          Notifications could not load
        </h1>
        <p className="mt-1.5 text-[13px] leading-snug text-foreground-muted">
          Nothing was marked read. Try again in a moment.
        </p>
        <div className="mt-4 flex items-center justify-center gap-2">
          <button
            type="button"
            onClick={reset}
            className="vu-btn vu-btn-primary inline-flex h-9 items-center gap-1.5 px-3.5 text-[13px]"
          >
            <RotateCw className="size-3.5" aria-hidden />
            Try again
          </button>
          <Link
            href="/home"
            className="vu-btn vu-btn-secondary inline-flex h-9 items-center px-3.5 text-[13px] no-underline"
          >
            Back to Explorer
          </Link>
        </div>
        {error.digest ? (
          <p className="mt-3 text-[11px] tabular-nums text-foreground-muted">
            Reference {error.digest}
          </p>
        ) : null}
      </div>
    </div>
  );
}
