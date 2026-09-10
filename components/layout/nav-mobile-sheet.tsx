"use client";

import Link from "next/link";
import { Menu, X } from "lucide-react";
import { useEffect, useState } from "react";
import { CHECKOUT_LABEL, CHECKOUT_URL } from "@/lib/marketing/checkout";

/**
 * Mobile navigation as a slide-down sheet.
 *
 * Replaces the old <details> dropdown: it closes on Escape and on route
 * change, locks the page behind it, and gives each destination a real tap
 * target instead of a cramped menu.
 */
export function NavMobileSheet({
  signedIn,
  isAdmin,
  links,
}: {
  signedIn: boolean;
  isAdmin: boolean;
  links: { href: string; label: string }[];
}) {
  const [open, setOpen] = useState(false);

  useEffect(() => {
    if (!open) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") setOpen(false);
    };
    window.addEventListener("keydown", onKey);
    const previous = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      window.removeEventListener("keydown", onKey);
      document.body.style.overflow = previous;
    };
  }, [open]);

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen((value) => !value)}
        aria-expanded={open}
        aria-label={open ? "Close menu" : "Open menu"}
        className="inline-flex size-11 items-center justify-center rounded-full text-foreground transition hover:bg-sage lg:hidden"
      >
        {open ? <X className="size-5" aria-hidden /> : <Menu className="size-5" aria-hidden />}
      </button>

      {open ? (
        <>
          <button
            type="button"
            aria-hidden
            tabIndex={-1}
            onClick={() => setOpen(false)}
            className="fixed inset-0 top-[72px] z-30 cursor-default bg-forest/25 backdrop-blur-sm lg:hidden"
          />
          <nav
            aria-label="Mobile"
            className="fixed inset-x-0 top-[72px] z-40 max-h-[calc(100dvh-72px)] overflow-y-auto border-b border-sand bg-background px-5 pb-8 pt-4 shadow-[0_24px_48px_rgba(15,61,50,0.16)] lg:hidden"
          >
            <ul className="space-y-1">
              {links.map((link) => (
                <li key={link.href}>
                  <Link
                    href={link.href}
                    onClick={() => setOpen(false)}
                    className="flex min-h-12 items-center rounded-2xl px-4 text-base font-semibold text-foreground no-underline transition hover:bg-sage hover:text-forest"
                  >
                    {link.label}
                  </Link>
                </li>
              ))}
              {signedIn ? (
                <li>
                  <Link
                    href="/compose"
                    onClick={() => setOpen(false)}
                    className="flex min-h-12 items-center rounded-2xl px-4 text-base font-semibold text-foreground no-underline transition hover:bg-sage hover:text-forest"
                  >
                    Create post
                  </Link>
                </li>
              ) : null}
              {signedIn && isAdmin ? (
                <li>
                  <Link
                    href="/admin/billing"
                    onClick={() => setOpen(false)}
                    className="flex min-h-12 items-center rounded-2xl px-4 text-base font-semibold text-foreground no-underline transition hover:bg-sage hover:text-forest"
                  >
                    Admin
                  </Link>
                </li>
              ) : null}
            </ul>

            <div className="mt-5 border-t border-sand pt-5">
              {signedIn ? (
                <Link
                  href="/settings"
                  onClick={() => setOpen(false)}
                  className="flex min-h-12 items-center rounded-2xl px-4 text-base font-semibold text-foreground no-underline transition hover:bg-sage"
                >
                  Your profile
                </Link>
              ) : (
                <div className="space-y-3">
                  <a
                    href={CHECKOUT_URL}
                    data-samcart-checkout
                    className="vu-cta-fill flex h-12 items-center justify-center rounded-full text-base font-semibold no-underline"
                  >
                    {CHECKOUT_LABEL}
                  </a>
                  <Link
                    href="/login"
                    onClick={() => setOpen(false)}
                    className="flex min-h-12 items-center justify-center rounded-full border border-sand text-base font-semibold text-forest no-underline"
                  >
                    Sign in
                  </Link>
                </div>
              )}
            </div>
          </nav>
        </>
      ) : null}
    </>
  );
}
