import Link from "next/link";
import { redirect } from "next/navigation";
import { MailX } from "lucide-react";
import { applyUnsubscribe, verifyUnsubscribe } from "@/lib/notifications/unsubscribe";
import { PREF_ROWS } from "@/lib/notifications/preferences";
import { consumeRateLimit } from "@/lib/auth/rate-limit";

export const dynamic = "force-dynamic";
export const metadata = {
  title: "Email preferences",
  robots: { index: false, follow: false },
};

/**
 * Where the footer link in a notification email lands.
 *
 * Asks before it changes anything. Mail scanners open every link in an email,
 * so a link that unsubscribed on GET would unsubscribe people who never
 * clicked it; the change happens only when the button posts. No sign-in is
 * needed — the signed link is the proof — and the only thing it can do is turn
 * off one kind of email for one member.
 */
type Params = { u?: string; c?: string; t?: string; done?: string };

async function confirmAction(formData: FormData) {
  "use server";
  const input = {
    u: String(formData.get("u") ?? ""),
    c: String(formData.get("c") ?? ""),
    t: String(formData.get("t") ?? ""),
  };
  const verified = verifyUnsubscribe(input);
  if (!verified) redirect("/unsubscribe");
  const limit = await consumeRateLimit(`unsubscribe:${verified.userId}`, 30, 60 * 60 * 1000);
  if (limit.ok) await applyUnsubscribe(verified);
  redirect(`/unsubscribe?${new URLSearchParams({ ...input, done: "1" }).toString()}`);
}

export default async function UnsubscribePage({
  searchParams,
}: {
  searchParams: Promise<Params>;
}) {
  const params = await searchParams;
  const verified = verifyUnsubscribe(params);
  const label = verified
    ? PREF_ROWS.find((row) => row.category === verified.category)?.label ?? "these"
    : null;

  return (
    <article className="vu-gutter mx-auto max-w-xl py-16">
      <div className="rounded-card border border-border bg-surface p-6 text-center sm:p-8">
        <span className="mx-auto grid size-12 place-items-center rounded-full bg-brand-wash text-on-brand-wash">
          <MailX className="size-6" aria-hidden />
        </span>

        {!verified ? (
          <>
            <h1 className="mt-4 font-display text-[1.5rem] font-bold text-foreground">
              This link does not work
            </h1>
            <p className="mt-2 text-[14px] text-foreground-muted">
              It may have been copied incompletely. You can change every email
              setting from your account instead.
            </p>
          </>
        ) : params.done === "1" ? (
          <>
            <h1 className="mt-4 font-display text-[1.5rem] font-bold text-foreground">
              Done
            </h1>
            <p className="mt-2 text-[14px] text-foreground-muted">
              You will not get “{label}” emails any more. They still appear in
              your notifications inside Vegan University.
            </p>
          </>
        ) : (
          <>
            <h1 className="mt-4 font-display text-[1.5rem] font-bold text-foreground">
              Stop “{label}” emails?
            </h1>
            <p className="mt-2 text-[14px] text-foreground-muted">
              Only this kind of email stops. Everything else, and your in-app
              notifications, stay as they are.
            </p>
            <form action={confirmAction} className="mt-5">
              <input type="hidden" name="u" value={params.u} />
              <input type="hidden" name="c" value={params.c} />
              <input type="hidden" name="t" value={params.t} />
              <button
                type="submit"
                className="vu-btn vu-btn-primary inline-flex h-11 items-center px-5 text-[14px]"
              >
                Stop these emails
              </button>
            </form>
          </>
        )}

        <p className="mt-6 text-[13px]">
          <Link href="/settings#notifications" className="text-foreground-muted underline-offset-2 hover:underline">
            All notification settings
          </Link>
        </p>
      </div>
    </article>
  );
}
