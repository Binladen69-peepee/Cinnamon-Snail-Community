import { Check, Sparkles } from "lucide-react";
import { CheckoutButton } from "@/components/marketing/checkout-button";
import { PhotoSlot } from "@/components/marketing/photo-slot";
import { MembershipGallery } from "@/components/marketing/membership-gallery";
import { LeafCluster } from "@/components/marketing/hero-decor";
import { Spotlight } from "@/components/marketing/spotlight";
import {
  CANCEL_REASSURANCE,
  MEMBERSHIP_PLANS,
} from "@/lib/marketing/checkout";
import { MEMBERSHIP_PAGE } from "@/lib/marketing/copy";
import type { MembershipSlide } from "@/lib/marketing/class-library";
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
  slides,
}: {
  heading: string;
  body?: string;
  photoId?: string;
  slides?: MembershipSlide[];
}) {
  const gallery = Boolean(slides && slides.length > 0);
  const media = gallery || Boolean(photoId);
  return (
    <section aria-labelledby="membership-plans-heading" className="relative">
      <div
        aria-hidden
        className="pointer-events-none absolute -right-16 -top-6 w-[200px] text-forest opacity-[0.1] dark:opacity-[0.14]"
      >
        <LeafCluster className="vu-leaf-float w-full" />
      </div>

      <div
        className={cn(
          "relative grid grid-cols-1 gap-6",
          media &&
            "lg:grid-cols-[minmax(0,1.05fr)_minmax(0,0.95fr)] lg:grid-rows-[auto_minmax(0,1fr)_auto] lg:items-stretch lg:gap-x-10 lg:gap-y-5",
        )}
      >
        <header className="order-1 lg:col-start-1 lg:row-start-1">
          <p className="vu-kicker">Membership</p>
          <h2
            id="membership-plans-heading"
            className="vu-title-script-sm vu-headline mt-3 text-forest"
          >
            <span className="vu-title-anim">{heading}</span>
          </h2>
          {body ? (
            <p className="vu-measure mt-4 text-base leading-relaxed text-foreground-muted md:text-lg">
              {body}
            </p>
          ) : null}
        </header>

        <div
          className={cn(
            "order-3 grid items-stretch gap-3 sm:grid-cols-2",
            media
              ? "lg:col-start-1 lg:row-start-2"
              : "mt-2 md:gap-4",
          )}
        >
          {MEMBERSHIP_PLANS.map((plan) => (
            <PlanCard key={plan.id} plan={plan} compact={media} />
          ))}
        </div>

        <p
          className={cn(
            "order-4 text-sm leading-relaxed text-foreground-muted",
            media ? "lg:col-start-1 lg:row-start-3" : "mt-5",
          )}
        >
          {`Note: ${CANCEL_REASSURANCE}`}
        </p>

        {media ? (
          <div className="order-2 min-h-[18rem] overflow-hidden rounded-[1.75rem] sm:min-h-[22rem] lg:col-start-2 lg:row-span-3 lg:row-start-1 lg:h-full lg:min-h-0">
            <div className="relative size-full min-h-[18rem] lg:min-h-full">
              {gallery && slides ? (
                <MembershipGallery slides={slides} />
              ) : photoId ? (
                <div className="absolute inset-0">
                  <PhotoSlot
                    id={photoId}
                    aspect="h-full w-full"
                    rounded="rounded-none"
                  />
                </div>
              ) : null}
            </div>
          </div>
        ) : null}
      </div>
    </section>
  );
}

function PlanCard({
  plan,
  compact,
}: {
  plan: (typeof MEMBERSHIP_PLANS)[number];
  compact: boolean;
}) {
  const featured = plan.featured;

  return (
    <Spotlight
      className={cn(
        "relative flex h-full flex-col overflow-hidden rounded-[1.35rem]",
        compact ? "p-4 md:p-5" : "p-6 md:p-7",
        featured
          ? "bg-[#0f3d32] text-[#fff8ef] shadow-[var(--e3)]"
          : "vu-card",
      )}
    >
      {featured ? (
        <span
          aria-hidden
          className="pointer-events-none absolute -right-12 -top-16 size-40 rounded-full bg-[#fff8ef]/10 blur-2xl"
        />
      ) : null}

      {featured ? (
        <span className="inline-flex w-fit items-center gap-1.5 rounded-full bg-white/12 px-2.5 py-1 text-[10px] uppercase tracking-[0.14em] text-[#fff8ef]">
          <Sparkles className="size-3" aria-hidden />
          {plan.name}
        </span>
      ) : (
        <span className="inline-flex w-fit rounded-full border border-border px-2.5 py-1 text-[10px] uppercase tracking-[0.14em] text-olive">
          {plan.name}
        </span>
      )}

      <p
        className={cn(
          "font-display mt-3 tracking-tight",
          compact ? "text-4xl" : "text-5xl",
          featured ? "text-[#fff8ef]" : "text-forest",
        )}
      >
        {plan.price}
      </p>
      <p
        className={cn(
          "mt-0.5 text-xs",
          featured ? "text-[#fff8ef]/70" : "text-olive",
        )}
      >
        {plan.period}
        {plan.note ? ` · ${plan.note}` : null}
      </p>

      <ul className={cn("space-y-2", compact ? "mt-4" : "mt-5")}>
        {MEMBERSHIP_PAGE.inside.map((item) => (
          <li key={item.title} className="flex gap-2">
            <Check
              className={cn(
                "mt-0.5 size-3.5 shrink-0",
                featured ? "text-[#fff8ef]" : "text-forest",
              )}
              aria-hidden
            />
            <span
              className={cn(
                "text-xs leading-snug",
                featured ? "text-[#fff8ef]/90" : "text-foreground",
              )}
            >
              {item.title}
            </span>
          </li>
        ))}
      </ul>

      <div className="mt-auto pt-5">
        <CheckoutButton
          size="md"
          withArrow
          tone={featured ? "onDark" : "default"}
          className={cn(
            "w-full justify-center",
            featured && "bg-[#FFF8EF] text-[#0F3D32] hover:bg-white",
          )}
        />
      </div>
    </Spotlight>
  );
}
