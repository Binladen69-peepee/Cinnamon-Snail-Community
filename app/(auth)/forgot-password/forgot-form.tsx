"use client";

import { useActionState, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { CheckCircle2 } from "lucide-react";
import { requestResetAction } from "@/app/(auth)/forgot-password/actions";
import { AuthShell, Field, Submit } from "@/app/(auth)/form-controls";
import { toast } from "@/components/ui/toast";

export function ForgotForm() {
  const [state, action, pending] = useActionState(requestResetAction, {});
  const [email, setEmail] = useState("");

  const announced = useRef<string | null>(null);
  useEffect(() => {
    const signature = state.error ?? (state.sent ? "sent" : null);
    if (signature === announced.current) return;
    announced.current = signature;
    if (state.error) toast.danger(state.error);
    else if (state.sent) toast.success("If that address has an account, the link is on its way.");
  }, [state]);

  return (
    <AuthShell
      title="Forgot your password"
      subtitle="We will email you a link to choose a new one."
      footer={
        <>
          Remembered it?{" "}
          <Link href="/login" className="font-semibold text-foreground underline">
            Back to sign in
          </Link>
        </>
      }
    >
      {state.sent ? (
        <div
          role="status"
          className="rounded-ctl border border-border bg-background px-4 py-6 text-center"
        >
          <CheckCircle2 className="mx-auto size-6 text-foreground" aria-hidden />
          <p className="mt-2 text-[14px] font-semibold text-foreground">
            Check your inbox
          </p>
          <p className="mx-auto mt-1 max-w-[34ch] text-[13px] text-foreground-muted">
            If that address has an account, a reset link is on its way. It
            expires in an hour, and works once.
          </p>
        </div>
      ) : (
        <form action={action} className="space-y-3">
          <Field
            id="forgot-email"
            label="Email"
            type="email"
            name="email"
            autoComplete="email"
            required
            placeholder="you@example.com"
            value={email}
            onChange={setEmail}
            error={state.error}
            disabled={pending}
          />
          <Submit pending={pending}>
            {pending ? "Sending link…" : "Email me a reset link"}
          </Submit>
        </form>
      )}
    </AuthShell>
  );
}
