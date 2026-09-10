import { ArrowRight } from "lucide-react";
import { CHECKOUT_LABEL, CHECKOUT_URL } from "@/lib/marketing/checkout";
import { cn } from "@/lib/utils";

/**
 * The only call to action on the sales pages. A plain anchor, not a Next
 * <Link>: the SamCart slide script binds to the href fragment on click, and
 * client-side navigation would swallow it.
 */
export function CheckoutButton({
  size = "md",
  className,
  withArrow = false,
}: {
  size?: "md" | "lg";
  className?: string;
  withArrow?: boolean;
}) {
  return (
    <a
      href={CHECKOUT_URL}
      data-samcart-checkout
      className={cn(
        "vu-cta-fill vu-cta-glow inline-flex items-center gap-3 rounded-full font-semibold no-underline",
        size === "lg" ? "h-13 px-8 text-base" : "h-12 px-7 text-sm",
        withArrow && "pl-2",
        className,
      )}
    >
      {withArrow ? (
        <span className="grid size-9 place-items-center rounded-full bg-white !text-forest dark:bg-paper dark:!text-black">
          <ArrowRight className="size-4" aria-hidden />
        </span>
      ) : null}
      {CHECKOUT_LABEL}
    </a>
  );
}

