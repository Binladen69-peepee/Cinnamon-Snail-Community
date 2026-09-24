import { ArrowRight } from "lucide-react";
import { CHECKOUT_LABEL, CHECKOUT_URL } from "@/lib/marketing/checkout";
import { cn } from "@/lib/utils";

/**
 * The only call to action on the sales pages. A plain anchor, not a Next
 * <Link>: the SamCart slide script binds to the href fragment on click, and
 * client-side navigation would swallow it.
 *
 * `tone="onDark"` is required on the inverted panels — the default fill is
 * forest, which disappears against a forest background.
 */
export function CheckoutButton({
  size = "md",
  tone = "default",
  className,
  withArrow = false,
}: {
  size?: "md" | "lg";
  tone?: "default" | "onDark";
  className?: string;
  withArrow?: boolean;
}) {
  const onDark = tone === "onDark";
  return (
    <a
      href={CHECKOUT_URL}
      data-samcart-checkout
      className={cn(
        "vu-cta-glow inline-flex items-center gap-3 rounded-full font-semibold no-underline",
        // The dark panel's ground is --forest, which inverts. A fill of
        // --brand-fill matches it exactly in light mode, so the button
        // disappeared into its own panel. The page colour always contrasts.
        onDark ? "bg-background text-foreground hover:opacity-90" : "vu-cta-fill",
        size === "lg" ? "h-13 px-8 text-base" : "h-12 px-7 text-sm",
        withArrow && "pl-2",
        className,
      )}
    >
      {withArrow ? (
        <span
          className={cn(
            "grid size-9 place-items-center rounded-full",
            // The disc is always the opposite of the button it sits in.
            onDark
              ? "bg-foreground text-background"
              : "bg-background text-foreground",
          )}
        >
          <ArrowRight className="size-4 vu-cta-arrow" aria-hidden />
        </span>
      ) : null}
      {CHECKOUT_LABEL}
    </a>
  );
}
