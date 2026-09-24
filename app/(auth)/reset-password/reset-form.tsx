"use client";

import { useActionState, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { resetPasswordAction } from "@/app/(auth)/reset-password/actions";
import {
  AuthShell,
  Field,
  StrengthMeter,
  Submit,
} from "@/app/(auth)/form-controls";
import { toast } from "@/components/ui/toast";
import {
  PASSWORD_MIN_LENGTH,
  passwordProblems,
  passwordStrength,
} from "@/lib/auth/password-policy";

export function ResetForm({
  email,
  token,
}: {
  email: string;
  token: string;
}) {
  const [state, action, pending] = useActionState(resetPasswordAction, {});
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");

  const strength = useMemo(() => passwordStrength(password), [password]);
  const localProblem = useMemo(
    () => (password.length > 0 ? passwordProblems(password, { email })[0] : undefined),
    [password, email],
  );
  const mismatch =
    confirm.length > 0 && password !== confirm
      ? "The two passwords do not match."
      : undefined;

  const announced = useRef<string | null>(null);
  useEffect(() => {
    const message = state.error ?? null;
    if (message === announced.current) return;
    announced.current = message;
    if (message) toast.danger(message);
  }, [state]);

  return (
    <AuthShell
      title="Choose a new password"
      subtitle={`For ${email}. Every other session will be signed out.`}
      footer={
        <>
          Changed your mind?{" "}
          <Link href="/login" className="font-semibold text-foreground underline">
            Back to sign in
          </Link>
        </>
      }
    >
      <form action={action} className="space-y-3">
        <input type="hidden" name="email" value={email} />
        <input type="hidden" name="token" value={token} />
        <div>
          <Field
            id="reset-password"
            label="New password"
            type="password"
            name="password"
            autoComplete="new-password"
            required
            minLength={PASSWORD_MIN_LENGTH}
            placeholder={`At least ${PASSWORD_MIN_LENGTH} characters`}
            value={password}
            onChange={setPassword}
            error={localProblem}
            disabled={pending}
          />
          {password.length > 0 ? (
            <StrengthMeter
              id="reset-password-strength"
              score={strength.score}
              label={strength.label}
            />
          ) : null}
        </div>
        <Field
          id="reset-confirm"
          label="Confirm new password"
          type="password"
          name="confirm"
          autoComplete="new-password"
          required
          placeholder="Type it once more"
          value={confirm}
          onChange={setConfirm}
          error={mismatch}
          disabled={pending}
        />
        {state.error && !mismatch && !localProblem ? (
          <p role="alert" className="text-[12px] font-semibold text-danger">
            {state.error}
          </p>
        ) : null}
        <Submit pending={pending}>
          {pending ? "Saving…" : "Save new password"}
        </Submit>
      </form>
    </AuthShell>
  );
}
