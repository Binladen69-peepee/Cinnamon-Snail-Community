import { BookOpen, Heart, Utensils } from "lucide-react";
import { PhotoSlot } from "@/components/marketing/photo-slot";
import { DrawLine, Rise, Stagger, StaggerItem } from "@/components/marketing/motion";
import { PILLAR_CARDS } from "@/lib/marketing/copy";

const STEP_ICONS = [BookOpen, Utensils, Heart] as const;

/**
 * "How it works" (DEC-089): Learn, Cook, Belong as the three steps they are —
 * take a class, make the dish that night, share it at the table — in one
 * row joined by a line that draws itself, instead of three full-width photo
 * spreads. The copy and photographs are the signed-off pillar data.
 */
export function HowItWorks() {
  return (
    <section aria-labelledby="how-it-works-heading" className="relative">
      <Rise className="mx-auto max-w-2xl text-center">
        <p className="vu-kicker">How it works</p>
        <h2 id="how-it-works-heading" className="vu-title-script-sm vu-headline mt-3 text-foreground">
          <span className="vu-title-anim">Learn. Cook. Belong.</span>
        </h2>
      </Rise>

      <div className="relative mt-10 md:mt-14">
        {/* The thread through the three steps: across on wide screens, down
            the side on narrow ones. */}
        <div className="pointer-events-none absolute inset-x-[16.6%] top-6 hidden h-px bg-border lg:block" aria-hidden>
          <DrawLine className="h-px w-full bg-[var(--accent)]" />
        </div>
        <div className="pointer-events-none absolute bottom-10 left-6 top-6 w-px bg-border lg:hidden" aria-hidden>
          <DrawLine vertical className="h-full w-px bg-[var(--accent)]" />
        </div>

        <Stagger as="ol" className="relative grid grid-cols-1 gap-8 lg:grid-cols-3 lg:gap-6">
          {PILLAR_CARDS.map((step, index) => {
            const Icon = STEP_ICONS[index] ?? BookOpen;
            return (
              <StaggerItem as="li" key={step.title} className="relative flex flex-col pl-16 lg:pl-0">
                <span className="absolute left-0 top-0 z-10 grid size-12 place-items-center rounded-full border border-border bg-background text-foreground shadow-[var(--e1)] lg:relative lg:mx-auto">
                  <Icon className="size-5" aria-hidden />
                  <span className="absolute -right-1 -top-1 grid size-5 place-items-center rounded-full bg-[var(--cta-fill)] text-[10px] font-semibold text-[var(--cta-fill-foreground)]">
                    {index + 1}
                  </span>
                </span>

                <article className="vu-step-card group mt-0 flex-1 overflow-hidden rounded-[1.5rem] border border-border bg-surface lg:mt-6">
                  <div className="relative overflow-hidden">
                    <PhotoSlot
                      id={step.slotId}
                      aspect="aspect-[16/10]"
                      rounded="rounded-none"
                      className="transition duration-700 group-hover:scale-[1.04]"
                    />
                  </div>
                  <div className="p-5 sm:p-6">
                    <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-foreground-muted">
                      Step {index + 1}
                    </p>
                    <h3 className="mt-1.5 text-xl font-semibold tracking-tight text-foreground">{step.title}</h3>
                    <p className="mt-2.5 text-sm leading-relaxed text-foreground-muted">{step.body}</p>
                  </div>
                </article>
              </StaggerItem>
            );
          })}
        </Stagger>
      </div>
    </section>
  );
}
