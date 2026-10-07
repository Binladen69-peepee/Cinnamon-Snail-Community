"use client";

import {
  createContext,
  useContext,
  useId,
  useRef,
  useState,
  type KeyboardEvent,
  type ReactNode,
} from "react";
import { motion, useReducedMotion } from "motion/react";
import { ChevronDown } from "lucide-react";
import { rovingTarget } from "@/components/aceternity/roving";
import { cn } from "@/lib/utils";

/**
 * An accordion in Aceternity's manner (soft cards, a chevron that turns, the
 * panel's height animated with motion) built to the WAI-ARIA accordion
 * pattern:
 *
 * - each header is a real button inside a heading, with `aria-expanded` and
 *   `aria-controls`;
 * - each panel is a region labelled by its header, and `hidden` once closed,
 *   so a closed panel's contents are out of the tab order and out of the
 *   accessibility tree, and a closed panel still exists for `aria-controls`;
 * - Up and Down move between headers (wrapping), Home and End jump to the
 *   ends;
 * - with reduced motion panels open and close without animating.
 */

type AccordionContextValue = {
  baseId: string;
  headingLevel: 2 | 3 | 4 | 5 | 6;
  isOpen: (value: string) => boolean;
  toggle: (value: string) => void;
};

const AccordionContext = createContext<AccordionContextValue | null>(null);

function useAccordion(): AccordionContextValue {
  const context = useContext(AccordionContext);
  if (!context) throw new Error("AccordionItem must be used inside an Accordion.");
  return context;
}

export type AccordionProps = {
  /** "single" keeps at most one item open; "multiple" lets any number be open. */
  type?: "single" | "multiple";
  /** The items open at first. */
  defaultValue?: readonly string[];
  /** The heading level each item's header sits in. */
  headingLevel?: 2 | 3 | 4 | 5 | 6;
  className?: string;
  children?: ReactNode;
};

export function Accordion({
  type = "multiple",
  defaultValue = [],
  headingLevel = 3,
  className,
  children,
}: AccordionProps) {
  const baseId = useId();
  const rootRef = useRef<HTMLDivElement>(null);
  const [open, setOpen] = useState<readonly string[]>(defaultValue);

  const context: AccordionContextValue = {
    baseId,
    headingLevel,
    isOpen: (value) => open.includes(value),
    toggle: (value) =>
      setOpen((current) => {
        if (current.includes(value)) return current.filter((item) => item !== value);
        return type === "single" ? [value] : [...current, value];
      }),
  };

  // One handler for every header: find the header with focus among them and
  // move to the one the key asks for.
  const onKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    const root = rootRef.current;
    const target = event.target as HTMLElement;
    if (!root || !target.matches("[data-accordion-trigger]")) return;
    const headers = [...root.querySelectorAll<HTMLElement>("[data-accordion-trigger]")].filter(
      (header) => header.closest("[data-accordion-root]") === root,
    );
    const next = rovingTarget(event.key, headers.indexOf(target), headers.length, "vertical");
    if (next === null) return;
    event.preventDefault();
    headers[next]?.focus();
  };

  return (
    <AccordionContext.Provider value={context}>
      <div
        ref={rootRef}
        data-accordion-root=""
        onKeyDown={onKeyDown}
        className={cn("flex flex-col gap-2", className)}
      >
        {children}
      </div>
    </AccordionContext.Provider>
  );
}

const EASE = [0.2, 0, 0.2, 1] as const;

export function AccordionItem({
  value,
  title,
  icon,
  children,
  className,
}: {
  /** Unique within its accordion. */
  value: string;
  title: ReactNode;
  icon?: ReactNode;
  children?: ReactNode;
  className?: string;
}) {
  const { baseId, headingLevel, isOpen, toggle } = useAccordion();
  const reduceMotion = useReducedMotion() === true;
  const open = isOpen(value);
  // Stays true through the closing animation, so the panel is only hidden
  // once it has finished collapsing.
  const [visible, setVisible] = useState(open);
  if (open && !visible) setVisible(true);

  const key = value.replace(/[^a-zA-Z0-9_-]/g, "-");
  const triggerId = `${baseId}-${key}-trigger`;
  const panelId = `${baseId}-${key}-panel`;
  const Heading = `h${headingLevel}` as const;

  return (
    <div
      data-state={open ? "open" : "closed"}
      className={cn(
        "rounded-card border border-border bg-surface shadow-e1 transition-[border-color] duration-200",
        open && "border-hairline-firm",
        className,
      )}
    >
      <Heading className="m-0 text-label font-semibold">
        <button
          type="button"
          id={triggerId}
          aria-expanded={open}
          aria-controls={panelId}
          data-accordion-trigger=""
          onClick={() => toggle(value)}
          className="flex min-h-12 w-full items-center gap-3 rounded-card px-4 py-3 text-left text-label font-semibold text-foreground transition hover:bg-surface-muted"
        >
          {icon ? (
            <span className="shrink-0 text-foreground-muted [&_svg]:size-4" aria-hidden>
              {icon}
            </span>
          ) : null}
          <span className="min-w-0 flex-1">{title}</span>
          <ChevronDown
            className={cn(
              "size-4 shrink-0 text-foreground-muted transition-transform duration-200 motion-reduce:transition-none",
              open && "rotate-180",
            )}
            aria-hidden
          />
        </button>
      </Heading>
      <motion.div
        id={panelId}
        role="region"
        aria-labelledby={triggerId}
        hidden={!open && (reduceMotion || !visible)}
        initial={false}
        animate={open ? "open" : "closed"}
        variants={{
          open: { height: "auto", opacity: 1 },
          closed: { height: 0, opacity: 0 },
        }}
        transition={reduceMotion ? { duration: 0 } : { duration: 0.25, ease: EASE }}
        onAnimationComplete={(definition) => {
          if (definition === "closed") setVisible(false);
        }}
        className="overflow-hidden"
      >
        <div className="px-4 pb-4 pt-0.5 text-body text-foreground-muted">{children}</div>
      </motion.div>
    </div>
  );
}
