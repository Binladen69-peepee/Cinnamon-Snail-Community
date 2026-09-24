"use client";

import { useActionState, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { CheckCircle2, Lock, Mail } from "lucide-react";
import {
  passwordSignInAction,
  sendMagicLinkAction,
} from "@/app/(auth)/login/actions";
import { SocialButtons } from "@/app/(auth)/login/social-buttons";
import { AuthShell, Field, Submit } from "@/app/(auth)/form-controls";
import { toast } from "@/components/ui/toast";
import { cn } from "@/lib/utils";

/**
 * Sign in.
 *
 * Two methods, one at a time. An earlier version stacked a magic-link form and
 * a password form on the same screen, each with its own email field, so the
 * page asked for the same address twice and neither field knew about the
 * other. A segmented switch keeps one visible and carries the address between
 * them.
 *
 * Errors are stated inline, next to the field that is wrong, and also
 * announced as a toast. Inline is where someone fixing it looks; the toast is
 * what a screen reader hears without hunting. Nothing that must be read to
 * stay correct is left to the toast alone, because a toast disappears.
 */

type Mode = "link" | "password";

export function LoginForm({
  social,
}: {
  social: { google: boolean; facebook: boolean };
}) {
  const searchParams = useSearchParams();
  const callbackUrl = searchParams.get("callbackUrl") ?? "/home";
  const urlError = searchParams.get("error");

  const [mode, setMode] = useState<Mode>("link");
  const [email, setEmail] = useState("");

  const [magicState, magicAction, magicPending] = useActionState(
    sendMagicLinkAction,
    {},
  );
  const [passwordState, passwordAction, passwordPending] = useActionState(
    passwordSignInAction,
    {},
  );

  // Announce each outcome once. Keyed on the state object so a repeated failure
  // with the same message still speaks, and a re-render does not.
  const announced = useRef<unknown>(null);
  useEffect(() => {
    const latest = magicState?.error ?? passwordState?.error ?? null;
    const sent = magicState?.sent ?? false;
    const signature = { latest, sent };
    if (JSON.stringify(signature) === JSON.stringify(announced.current)) return;
    announced.current = signature;
    if (latest) toast.danger(latest);
    else if (sent) toast.success("Sign-in link sent. Check your inbox.");
  }, [magicState, passwordState]);

  useEffect(() => {
    if (urlError) {
      toast.danger("That sign-in did not complete. Try again.");
    }
  }, [urlError]);

  const pending = magicPending || passwordPending;

  return (
    <AuthShell
      title="Welcome back"
      subtitle="Sign in to the kitchen."
      footer={
        <>
          New here?{" "}
          <Link
            href={`/register?callbackUrl=${encodeURIComponent(callbackUrl)}`}
            className="font-semibold text-foreground underline"
          >
            Create an account
          </Link>
          <span className="mx-2 text-border" aria-hidden>
            ·
          </span>
          <Link href="/membership" className="font-semibold text-foreground underline">
            See what is included
          </Link>
        </>
      }
    >
      <SocialButtons enabled={social} callbackUrl={callbackUrl} />

      <div
        role="tablist"
        aria-label="Sign-in method"
        className="mb-4 grid grid-cols-2 gap-1 rounded-ctl border border-border bg-background p-1"
      >
        {(
          [
            { value: "link", label: "Email link", icon: Mail },
            { value: "password", label: "Password", icon: Lock },
          ] as const
        ).map((option) => {
          const Icon = option.icon;
          const current = mode === option.value;
          return (
            <button
              key={option.value}
              type="button"
              role="tab"
              aria-selected={current}
              onClick={() => setMode(option.value)}
              className={cn(
                "inline-flex h-9 items-center justify-center gap-1.5 rounded-chip text-[13px] font-semibold transition",
                current
                  ? "bg-brand-fill text-brand-fill-foreground"
                  : "text-foreground-muted hover:text-foreground",
              )}
            >
              <Icon className="size-3.5" aria-hidden />
              {option.label}
            </button>
          );
        })}
      </div>

      {mode === "link" ? (
        magicState?.sent ? (
          <div
            role="status"
            className="rounded-ctl border border-border bg-background px-4 py-5 text-center"
          >
            <CheckCircle2 className="mx-auto size-6 text-foreground" aria-hidden />
            <p className="mt-2 text-[14px] font-semibold text-foreground">
              Check your inbox
            </p>
            <p className="mx-auto mt-1 max-w-[34ch] text-[13px] text-foreground-muted">
              If that address can sign in, a one-time link is on its way. Look
              in spam if it is quiet.
            </p>
          </div>
        ) : (
          <form action={magicAction} className="space-y-3">
            <Field
              id="magic-email"
              label="Email"
              type="email"
              name="email"
              required
              value={email}
              onChange={setEmail}
              autoComplete="email"
              placeholder="you@example.com"
              error={magicState?.error}
              disabled={pending}
            />
            <Submit pending={magicPending} disabled={pending}>
              {magicPending ? "Sending link…" : "Email me a sign-in link"}
            </Submit>
          </form>
        )
      ) : (
        <form action={passwordAction} className="space-y-3">
          <input type="hidden" name="callbackUrl" value={callbackUrl} />
          <Field
            id="password-email"
            label="Email"
            type="email"
            name="email"
            required
            value={email}
            onChange={setEmail}
            autoComplete="email"
            placeholder="you@example.com"
            disabled={pending}
          />
          <Field
            id="password-value"
            label="Password"
            type="password"
            name="password"
            required
            autoComplete="current-password"
            error={passwordState?.error}
            disabled={pending}
            trailing={
              <Link
                href="/forgot-password"
                className="text-[12px] font-semibold text-foreground-muted underline hover:text-foreground"
              >
                Forgot?
              </Link>
            }
          />
          <Submit pending={passwordPending} disabled={pending}>
            {passwordPending ? "Signing in…" : "Sign in"}
          </Submit>
        </form>
      )}
    </AuthShell>
  );
}
