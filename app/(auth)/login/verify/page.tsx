import { completeMagicSignIn } from "@/app/(auth)/login/actions";
import { AutoSubmit } from "@/app/(auth)/login/verify/auto-submit";
import { ErrorState } from "@/components/ui/error-state";
import Link from "next/link";

const ERRORS: Record<string, { title: string; body: string }> = {
  missing: {
    title: "This sign-in link is incomplete",
    body: "Request a new magic link from the sign-in page. The address should include both your email and a one-time token.",
  },
  expired: {
    title: "This sign-in link has expired",
    body: "Magic links last one hour. Request a new one and use it while it is still fresh.",
  },
  used: {
    title: "This sign-in link was already used",
    body: "Each link works only once. Request a new magic link to sign in again.",
  },
  invalid: {
    title: "This sign-in link is not valid",
    body: "The link may have been typed incorrectly, or it does not match that email. Request a new magic link.",
  },
};

export default async function VerifyPage({
  searchParams,
}: {
  searchParams: Promise<{ email?: string; token?: string; error?: string }>;
}) {
  const params = await searchParams;
  const error = params.error ? ERRORS[params.error] : null;

  if (error) {
    return (
      <div className="space-y-6">
        <ErrorState title={error.title} body={error.body} />
        <p className="text-center">
          <Link href="/login" className="text-olive underline-offset-2 hover:underline">
            Return to sign in
          </Link>
        </p>
      </div>
    );
  }

  if (!params.email || !params.token) {
    return (
      <div className="space-y-6">
        <ErrorState
          title={ERRORS.missing.title}
          body={ERRORS.missing.body}
        />
        <p className="text-center">
          <Link href="/login" className="text-olive underline-offset-2 hover:underline">
            Return to sign in
          </Link>
        </p>
      </div>
    );
  }

  return (
    <div className="text-center">
      <p className="text-sm uppercase tracking-[0.18em] text-olive">Signing you in</p>
      <h1 className="mt-2 font-display text-3xl text-forest">Opening the kitchen…</h1>
      <p className="mt-3 text-muted" role="status">
        Confirming your one-time link. You will be taken to your home table next.
      </p>
      <form id="magic-verify-form" action={completeMagicSignIn} className="mt-6">
        <input type="hidden" name="email" value={params.email} />
        <input type="hidden" name="token" value={params.token} />
        <button
          type="submit"
          className="min-h-11 rounded-full bg-forest px-5 text-sm text-cream"
        >
          Continue
        </button>
      </form>
      <AutoSubmit />
    </div>
  );
}
