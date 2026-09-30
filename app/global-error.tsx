"use client";

import { useEffect } from "react";
import * as Sentry from "@sentry/nextjs";

/**
 * The last-resort boundary: an error in the root layout itself.
 *
 * Every other error lands in a nearer boundary or in `onRequestError`; this one
 * replaces the whole document, so it renders its own `<html>` and `<body>` and
 * uses no app styles, fonts or providers — any of which could be what failed.
 * It reports to Sentry and offers the one thing that usually helps.
 */
export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    Sentry.captureException(error);
  }, [error]);

  return (
    <html lang="en">
      <body
        style={{
          margin: 0,
          minHeight: "100vh",
          display: "grid",
          placeItems: "center",
          fontFamily: "system-ui, sans-serif",
          background: "#000",
          color: "#fff",
        }}
      >
        <div style={{ textAlign: "center", padding: 24 }}>
          <h1 style={{ fontSize: 20, margin: 0 }}>Something went wrong</h1>
          <p style={{ opacity: 0.7, fontSize: 14 }}>
            It has been reported. Nothing was changed, so it is safe to try again.
          </p>
          <button
            type="button"
            onClick={reset}
            style={{
              marginTop: 8,
              padding: "8px 16px",
              borderRadius: 8,
              border: "1px solid #fff",
              background: "transparent",
              color: "#fff",
              cursor: "pointer",
            }}
          >
            Try again
          </button>
          {error.digest ? (
            <p style={{ opacity: 0.5, fontSize: 12 }}>Reference {error.digest}</p>
          ) : null}
        </div>
      </body>
    </html>
  );
}
