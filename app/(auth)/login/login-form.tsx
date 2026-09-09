"use client";

import { useActionState } from "react";
import { useSearchParams } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card } from "@/components/ui/card";
import {
  passwordSignInAction,
  sendMagicLinkAction,
} from "@/app/(auth)/login/actions";

export function LoginForm() {
  const searchParams = useSearchParams();
  const callbackUrl = searchParams.get("callbackUrl") ?? "/home";
  const [magicState, magicAction, magicPending] = useActionState(
    sendMagicLinkAction,
    {},
  );
  const [passwordState, passwordAction, passwordPending] = useActionState(
    passwordSignInAction,
    {},
  );

  return (
    <Card className="p-8">
      <p className="text-sm uppercase tracking-[0.18em] text-olive">Welcome</p>
      <h1 className="mt-2 font-display text-4xl text-forest">Come in to the kitchen</h1>
      <p className="mt-3 text-muted">
        We will email you a sign-in link. Password is optional if you have set
        one.
      </p>

      {magicState?.sent ? (
        <p className="mt-6 rounded-2xl bg-sage/40 px-4 py-3 text-sm text-forest" role="status">
          If that address can sign in, a one-time link is on its way. Check the
          inbox — and the spam folder if it is quiet.
        </p>
      ) : (
        <form action={magicAction} className="mt-8 space-y-4">
          <label className="block text-sm font-medium text-forest">
            Email
            <Input
              className="mt-2"
              type="email"
              name="email"
              required
              autoComplete="email"
              placeholder="you@example.com"
            />
          </label>
          {magicState?.error ? (
            <p className="text-sm text-danger" role="alert">
              {magicState.error}
            </p>
          ) : null}
          <Button type="submit" className="w-full" disabled={magicPending}>
            {magicPending ? "Sending link…" : "Email me a sign-in link"}
          </Button>
        </form>
      )}

      <form action={passwordAction} className="mt-8 space-y-4 border-t border-sand pt-8">
        <p className="text-sm text-muted">Or sign in with a password</p>
        <input type="hidden" name="callbackUrl" value={callbackUrl} />
        <Input type="email" name="email" required placeholder="Email" autoComplete="email" />
        <Input
          type="password"
          name="password"
          required
          placeholder="Password"
          autoComplete="current-password"
        />
        {passwordState?.error ? (
          <p className="text-sm text-danger" role="alert">
            {passwordState.error}
          </p>
        ) : null}
        <Button type="submit" variant="secondary" className="w-full" disabled={passwordPending}>
          {passwordPending ? "Signing in…" : "Sign in with password"}
        </Button>
      </form>
    </Card>
  );
}
