"use client";

import { useState } from "react";
import { signIn } from "next-auth/react";
import { Loader2 } from "lucide-react";
import { toast } from "@/components/ui/toast";

/**
 * Google and Facebook sign-in.
 *
 * Rendered only for providers the server says are configured, so this cannot
 * offer a button that fails the moment it is pressed. The marks are inlined
 * rather than fetched: a login page that waits on a third-party CDN to draw its
 * own buttons is a login page that sometimes does not.
 */

function GoogleMark() {
  return (
    <svg viewBox="0 0 18 18" className="size-4 shrink-0" aria-hidden>
      <path fill="#4285F4" d="M17.64 9.2c0-.64-.06-1.25-.16-1.84H9v3.48h4.84a4.14 4.14 0 0 1-1.8 2.72v2.26h2.91c1.7-1.57 2.69-3.88 2.69-6.62Z" />
      <path fill="#34A853" d="M9 18c2.43 0 4.47-.8 5.96-2.18l-2.91-2.26c-.81.54-1.84.86-3.05.86-2.34 0-4.33-1.58-5.04-3.71H.96v2.33A9 9 0 0 0 9 18Z" />
      <path fill="#FBBC05" d="M3.96 10.71a5.41 5.41 0 0 1 0-3.42V4.96H.96a9 9 0 0 0 0 8.08l3-2.33Z" />
      <path fill="#EA4335" d="M9 3.58c1.32 0 2.5.45 3.44 1.35l2.58-2.58C13.46.89 11.43 0 9 0A9 9 0 0 0 .96 4.96l3 2.33C4.67 5.16 6.66 3.58 9 3.58Z" />
    </svg>
  );
}

function FacebookMark() {
  return (
    <svg viewBox="0 0 24 24" className="size-4 shrink-0" aria-hidden>
      <path
        fill="#1877F2"
        d="M24 12.07C24 5.4 18.63 0 12 0S0 5.4 0 12.07C0 18.1 4.39 23.1 10.13 24v-8.44H7.08v-3.49h3.05V9.41c-3.01 0-5.32 1.83-5.32 5.19v2.96h-2.8V24h2.8v-8.44h-2.8"
      />
      <path
        fill="#1877F2"
        d="M12 0C5.37 0 0 5.4 0 12.07 0 18.1 4.39 23.1 10.13 24v-8.44H7.08v-3.49h3.05V9.41c0-3.02 1.79-4.69 4.53-4.69 1.31 0 2.69.24 2.69.24v2.96h-1.52c-1.49 0-1.96.93-1.96 1.89v2.26h3.33l-.53 3.49h-2.8V24C19.61 23.1 24 18.1 24 12.07 24 5.4 18.63 0 12 0Z"
      />
    </svg>
  );
}

const PROVIDERS = {
  google: { label: "Continue with Google", Mark: GoogleMark },
  facebook: { label: "Continue with Facebook", Mark: FacebookMark },
} as const;

export function SocialButtons({
  enabled,
  callbackUrl,
}: {
  enabled: { google: boolean; facebook: boolean };
  callbackUrl: string;
}) {
  const [busy, setBusy] = useState<string | null>(null);
  const available = (Object.keys(PROVIDERS) as (keyof typeof PROVIDERS)[]).filter(
    (key) => enabled[key],
  );

  if (available.length === 0) return null;

  async function start(provider: string) {
    setBusy(provider);
    try {
      await signIn(provider, { callbackUrl });
    } catch {
      // signIn normally navigates away, so reaching here means it did not.
      setBusy(null);
      toast.danger("That sign-in could not be started. Try again in a moment.");
    }
  }

  return (
    <div className="space-y-2">
      {available.map((key) => {
        const { label, Mark } = PROVIDERS[key];
        const loading = busy === key;
        return (
          <button
            key={key}
            type="button"
            onClick={() => start(key)}
            disabled={busy !== null}
            className="vu-btn vu-btn-secondary flex h-11 w-full items-center justify-center gap-2.5 text-[14px]"
          >
            {loading ? (
              <Loader2 className="size-4 shrink-0 animate-spin" aria-hidden />
            ) : (
              <Mark />
            )}
            {loading ? "Opening…" : label}
          </button>
        );
      })}

      <div className="flex items-center gap-3 pt-1">
        <span className="h-px flex-1 bg-border" aria-hidden />
        <span className="text-[11.5px] font-semibold uppercase tracking-[0.12em] text-foreground-muted">
          or
        </span>
        <span className="h-px flex-1 bg-border" aria-hidden />
      </div>
    </div>
  );
}
