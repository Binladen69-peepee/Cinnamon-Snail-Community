"use client";

import { useActionState, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { registerAction } from "@/app/(auth)/register/actions";
import { SocialButtons } from "@/app/(auth)/login/social-buttons";
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

/**
 * Create an account.
 *
 * The password rules are checked here as you type and again on the server
 * before anything is hashed — the same pure function in both places, so the
 * two can never disagree about what is acceptable. Nothing is disabled on the
 * strength of the client check: someone with an unusual password should be
 * able to submit and be told plainly, not find a dead button.
 */
export function RegisterForm({
  social,
}: {
  social: { google: boolean; facebook: boolean };
}) {
  const searchParams = useSearchParams();
  const callbackUrl = searchParams.get("callbackUrl") ?? "/home";

  const [state, action, pending] = useActionState(registerAction, {});
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [touched, setTouched] = useState(false);

  const strength = useMemo(() => passwordStrength(password), [password]);
  const localProblem = useMemo(() => {
    if (!touched || password.length === 0) return undefined;
    return passwordProblems(password, { email, name })[0];
  }, [touched, password, email, name]);
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

  const fieldError = (field: string) =>
    state.field === field ? state.error : undefined;

  return (
    <AuthShell
      title="Join the kitchen"
      subtitle="One account for the classes, the feed and the community."
      footer={
        <>
          Already a member?{" "}
          <Link
            href={`/login?callbackUrl=${encodeURIComponent(callbackUrl)}`}
            className="font-semibold text-foreground underline"
          >
            Sign in
          </Link>
        </>
      }
    >
      <SocialButtons enabled={social} callbackUrl={callbackUrl} />

      <form action={action} className="space-y-3">
        <input type="hidden" name="callbackUrl" value={callbackUrl} />
        <Field
          id="register-name"
          label="Name"
          name="name"
          autoComplete="name"
          required
          minLength={2}
          maxLength={60}
          placeholder="Sam Rivera"
          value={name}
          onChange={setName}
          error={fieldError("name")}
          disabled={pending}
        />
        <Field
          id="register-email"
          label="Email"
          type="email"
          name="email"
          autoComplete="email"
          required
          placeholder="you@example.com"
          value={email}
          onChange={setEmail}
          error={fieldError("email")}
          disabled={pending}
        />
        <div>
          <Field
            id="register-password"
            label="Password"
            type="password"
            name="password"
            autoComplete="new-password"
            required
            minLength={PASSWORD_MIN_LENGTH}
            placeholder={`At least ${PASSWORD_MIN_LENGTH} characters`}
            value={password}
            onChange={(next) => {
              setPassword(next);
              setTouched(true);
            }}
            error={localProblem ?? fieldError("password")}
            disabled={pending}
          />
          {password.length > 0 ? (
            <StrengthMeter
              id="register-password-strength"
              score={strength.score}
              label={strength.label}
            />
          ) : null}
        </div>
        <Field
          id="register-confirm"
          label="Confirm password"
          type="password"
          name="confirm"
          autoComplete="new-password"
          required
          placeholder="Type it once more"
          value={confirm}
          onChange={setConfirm}
          error={mismatch ?? fieldError("confirm")}
          disabled={pending}
        />

        <label
          htmlFor="register-terms"
          className="flex items-start gap-2.5 pt-1 text-[12.5px] leading-relaxed text-foreground-muted"
        >
          <input
            id="register-terms"
            type="checkbox"
            name="terms"
            required
            disabled={pending}
            aria-describedby={
              state.field === "terms" ? "register-terms-error" : undefined
            }
            className="mt-0.5 size-4 shrink-0 rounded-[4px] border border-field-border accent-foreground"
          />
          <span>
            I agree to the{" "}
            <Link href="/terms" className="font-semibold text-foreground underline">
              terms
            </Link>{" "}
            and the{" "}
            <Link href="/privacy" className="font-semibold text-foreground underline">
              privacy policy
            </Link>
            .
          </span>
        </label>
        {state.field === "terms" && state.error ? (
          <p
            id="register-terms-error"
            role="alert"
            className="text-[12px] font-semibold text-danger"
          >
            {state.error}
          </p>
        ) : null}

        {state.field === "form" && state.error ? (
          <p role="alert" className="text-[12px] font-semibold text-danger">
            {state.error}
          </p>
        ) : null}

        <Submit pending={pending}>
          {pending ? "Creating your account…" : "Create account"}
        </Submit>
      </form>
    </AuthShell>
  );
}
