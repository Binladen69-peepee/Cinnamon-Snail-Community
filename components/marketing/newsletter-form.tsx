"use client";

import { useActionState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { newsletterIntentAction } from "@/app/(marketing)/newsletter-action";

export function NewsletterForm() {
  const [state, action, pending] = useActionState(newsletterIntentAction, {
    message: "",
  });

  return (
    <form action={action} className="mt-4 space-y-3">
      <label className="block text-sm text-foreground-muted">
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
      <Button type="submit" variant="secondary" size="sm" disabled={pending}>
        {pending ? "Saving…" : "Request a note when we open this"}
      </Button>
      {state.message ? (
        <p className="text-sm text-foreground-muted" role="status">
          {state.message}
        </p>
      ) : (
        <p className="text-xs text-foreground-muted">
          Newsletter sending is not connected yet (Kit is not configured). This
          will not pretend to subscribe you.
        </p>
      )}
    </form>
  );
}
