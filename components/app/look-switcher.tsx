"use client";

import { useRouter } from "next/navigation";
import { useTransition } from "react";
import { Check, Loader2 } from "lucide-react";
import { LOOKS, type Look } from "@/lib/looks";
import { setLookAction } from "@/app/(member)/look-actions";
import { cn } from "@/lib/utils";

/**
 * Switches between the candidate identities.
 *
 * A cookie rather than a query string, so the choice survives navigating
 * between pages and you can judge a look across the whole app rather than on
 * one screen. Read on the server, so there is no flash of the previous theme.
 *
 * Deliberately conspicuous: it is scaffolding for a decision, not a feature,
 * and it goes when the decision is made.
 */
export function LookSwitcher({ current }: { current: Look | null }) {
  const router = useRouter();
  const [pending, start] = useTransition();

  function pick(value: Look | null) {
    start(async () => {
      await setLookAction(value ?? "");
      router.refresh();
    });
  }

  return (
    <div className="fixed bottom-3 left-1/2 z-[60] -translate-x-1/2 md:bottom-4">
      <div className="flex items-center gap-1 rounded-full border border-border bg-overlay/95 p-1 shadow-e2 backdrop-blur-md">
        <span className="hidden pl-2 pr-1 text-[10px] font-bold uppercase tracking-[0.12em] text-foreground-muted sm:inline">
          Look
          {pending ? (
            <Loader2 className="ml-1 inline size-2.5 animate-spin" aria-hidden />
          ) : null}
        </span>

        {LOOKS.map((look) => {
          const active = current === look.value;
          return (
            <button
              key={look.value}
              type="button"
              onClick={() => pick(look.value)}
              title={look.blurb}
              aria-pressed={active}
              className={cn(
                "inline-flex h-8 items-center gap-1.5 rounded-full px-3 text-[12.5px] font-bold transition",
                active
                  ? "bg-brand text-on-brand"
                  : "text-foreground-muted hover:bg-mint hover:text-foreground",
              )}
            >
              {active ? <Check className="size-3" aria-hidden /> : null}
              {look.label}
            </button>
          );
        })}

        <button
          type="button"
          onClick={() => pick(null)}
          title="The current theme, unchanged"
          aria-pressed={current === null}
          className={cn(
            "inline-flex h-8 items-center rounded-full px-3 text-[12.5px] font-bold transition",
            current === null
              ? "bg-brand text-on-brand"
              : "text-foreground-muted hover:bg-mint hover:text-foreground",
          )}
        >
          Current
        </button>
      </div>
    </div>
  );
}
