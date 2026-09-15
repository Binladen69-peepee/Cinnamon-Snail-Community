import { Check, Sparkles } from "lucide-react";
import { CheckoutButton } from "@/components/marketing/checkout-button";
import { PhotoSlot } from "@/components/marketing/photo-slot";
import { LeafCluster } from "@/components/marketing/hero-decor";
import { Spotlight } from "@/components/marketing/spotlight";
import {
  CANCEL_REASSURANCE,
  MEMBERSHIP_PLANS,
} from "@/lib/marketing/checkout";
import { MEMBERSHIP_PAGE } from "@/lib/marketing/copy";
import { cn } from "@/lib/utils";

/**
 * Plan cards for the homepage membership block and the /membership pricing
 * panel. Prices and the "2 months free" yearly note come from SamCart via
 * `PRICING` — this does not invent a third plan or a second checkout URL.
 */
export function MembershipPlans({
  heading,
  body,
  photoId,
  showInclusions = true,
}: {
  heading: string;
  body?: string;
  photoId?: string;
  showInclusions?: boolean;
}) {
  return (
    <section aria-labelledby="membership-plans-heading" className="relative">
      <div
        aria-hidden
        className="pointer-events-none absolute -right-20 top-0 w-[240px] text-forest opacity-[0.1] dark:opacity-[0.14]"
      >
        <LeafCluster className="vu-leaf-float w-full" />
      </div>

      <div
        className={cn(
          "relative grid items-end gap-10",
          photoId && "lg:grid-cols-[minmax(0,1.15fr)_minmax(0,0.85fr)]",
        )}
      >
        <div>
          <p className="vu-kicker">Membership</p>
          <h2
            id="membership-plans-heading"
            className="vu-title-script-sm vu-headline mt-3 text-forest"
          >
            <span className="vu-title-anim">{heading}</span>
          </h2>
          {body ? (
            <p className="vu-measure mt-5 text-lg leading-relaxed text-foreground-muted">
              {body}
            </p>
          ) : null}
        </div>
        {photoId ? (
          <div className="overflow-hidden rounded-[1.5rem]">
            <PhotoSlot
              id={photoId}
              aspect="min-h-[16rem] lg:min-h-[18rem]"
              rounded="rounded-none"
            />
          </div>
        ) : null}
      </div>

      <div className="mt-10 grid items-stretch gap-5 md:grid-cols-2">
        {MEMBERSHIP_PLANS.map((plan) => (
          <PlanCard key={plan.id} plan={plan} />
        ))}
      </div>

      {showInclusions ? (
        <ul className="mt-10 grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
          {MEMBERSHIP_PAGE.inside.map((item, index) => (
            <li
              key={item.title}
              className="rounded-[1.15rem] border border-border bg-surface/80 px-4 py-4"
            >
              <p className="text-[11px] uppercase tracking-[0.16em] text-olive">
                {String(index + 1).padStart(2, "0")}
              </p>
              <p className="mt-2 text-sm leading-snug text-foreground">{item.title}</p>
            </li>
          ))}
        </ul>
      ) : null}

      <p className="mt-8 flex items-start gap-2 text-sm text-foreground-muted">
        <Check className="mt-0.5 size-4 shrink-0 text-forest" aria-hidden />
        {CANCEL_REASSURANCE}
      </p>
    </section>
  );
}

function PlanCard({
  plan,
}: {
  plan: (typeof MEMBERSHIP_PLANS)[number];
}) {
  const featured = plan.featured;

  return (
    <Spotlight
      className={cn(
        "relative flex h-full flex-col overflow-hidden rounded-[1.75rem] p-7 md:p-8",
        featured
          ? "bg-[#0f3d32] text-[#fff8ef] shadow-[var(--e3)]"
          : "vu-card",
      )}
    >
      {featured ? (
        <span
          aria-hidden
          className="pointer-events-none absolute -right-16 -top-20 size-56 rounded-full bg-[#fff8ef]/10 blur-2xl"
        />
      ) : null}
      {featured ? (
        <span className="inline-flex w-fit items-center gap-1.5 rounded-full bg-white/12 px-3 py-1 text-[11px] uppercase tracking-[0.14em] text-[#fff8ef]">
          <Sparkles className="size-3.5" aria-hidden />
          {plan.name}
        </span>
      ) : (
        <span className="inline-flex w-fit rounded-full border border-border px-3 py-1 text-[11px] uppercase tracking-[0.14em] text-olive">
          {plan.name}
        </span>
      )}

      <p
        className={cn(
          "font-display mt-4 text-5xl tracking-tight md:text-6xl",
          featured ? "text-[#fff8ef]" : "text-forest",
        )}
      >
        {plan.price}
      </p>
      <p
        className={cn(
          "mt-1 text-sm",
          featured ? "text-[#fff8ef]/70" : "text-olive",
        )}
      >
        {plan.period}
        {plan.note ? ` · ${plan.note}` : null}
      </p>

      <div className="mt-auto pt-8">
        <CheckoutButton
          size="lg"
          withArrow
          tone={featured ? "onDark" : "default"}
          className={cn(
            "w-full justify-center",
            featured &&
              "bg-[#FFF8EF] text-[#0F3D32] hover:bg-white",
          )}
        />
      </div>
    </Spotlight>
  );
}
