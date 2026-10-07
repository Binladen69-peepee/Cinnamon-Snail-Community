"use client";

import {
  createContext,
  useContext,
  useEffect,
  useRef,
  type MouseEvent as ReactMouseEvent,
  type PointerEvent as ReactPointerEvent,
  type ReactNode,
  type RefObject,
} from "react";
import { createPortal } from "react-dom";
import { AnimatePresence, motion, useIsPresent, useReducedMotion } from "motion/react";
import { X } from "lucide-react";
import {
  isDismissKey,
  lockBodyScroll,
  tabbablesIn,
  trapFocusTarget,
} from "@/components/aceternity/dialog-focus";
import { cn } from "@/lib/utils";

/**
 * Aceternity's Animated Modal (ui.aceternity.com/components/animated-modal),
 * adapted.
 *
 * Kept: the centred panel that springs in on a 3D tilt (rotateX, scale and a
 * lift, under an 800px perspective), the blurred backdrop, the close icon that
 * grows and tips on hover, and the shaded footer strip.
 *
 * Changed:
 * - Controlled (`open`, `onClose`) instead of owning its state behind a
 *   provider and a trigger, so a caller can load it on demand and keep its
 *   own button.
 * - Painted from role tokens (overlay, border, backdrop, the modal radius,
 *   e3), so it follows the member's palette and mode.
 * - A real modal dialog: role="dialog" and aria-modal, named and described by
 *   the caller's title and description, focus moved in and kept in, Escape and
 *   the backdrop close it, focus goes back to the trigger, and the page behind
 *   neither scrolls nor shifts sideways. The original set `overflow: auto` on
 *   close whatever it had been; this restores the previous value.
 * - With reduced motion it only fades: no tilt, no spring.
 */

type ModalContextValue = { close: () => void };

const ModalContext = createContext<ModalContextValue | null>(null);

/** The open dialog's `close`, for parts rendered inside it. */
export function useModal(): ModalContextValue {
  const context = useContext(ModalContext);
  if (!context) throw new Error("useModal must be used inside an AnimatedModal.");
  return context;
}

export type AnimatedModalProps = {
  open: boolean;
  onClose: () => void;
  /** The id of the dialog's visible title. */
  labelledBy: string;
  /** The id of the line that says what the dialog is for. */
  describedBy?: string;
  children?: ReactNode;
  /** Classes for the panel, such as its width. */
  className?: string;
  /** Where the dialog is mounted. `document.body` when not given. */
  container?: Element | null;
  /** Render in place instead of through a portal. */
  portal?: boolean;
  /** Focused when the dialog opens. The panel itself when not given. */
  initialFocusRef?: RefObject<HTMLElement | null>;
  /** Focused when it closes. Whatever had focus before it opened when not given. */
  returnFocusRef?: RefObject<HTMLElement | null>;
  /** Whether a click outside the panel closes it. */
  closeOnBackdrop?: boolean;
};

const SPRING = { type: "spring", stiffness: 260, damping: 15 } as const;
const FADE = { duration: 0.15, ease: "easeOut" } as const;

const TILTED = {
  initial: { opacity: 0, scale: 0.5, rotateX: 40, y: 40 },
  animate: { opacity: 1, scale: 1, rotateX: 0, y: 0 },
  exit: { opacity: 0, scale: 0.8, rotateX: 10 },
};

const FADED = {
  initial: { opacity: 0 },
  animate: { opacity: 1 },
  exit: { opacity: 0 },
};

export function AnimatedModal({
  open,
  onClose,
  labelledBy,
  describedBy,
  children,
  className,
  container,
  portal = true,
  initialFocusRef,
  returnFocusRef,
  closeOnBackdrop = true,
}: AnimatedModalProps) {
  const panelRef = useRef<HTMLDivElement>(null);
  const reduceMotion = useReducedMotion() === true;
  const pressedOutside = useRef(false);

  // The latest handler, so the effect below runs once per opening rather than
  // on every render of the caller (which would pull focus back to the panel).
  const onCloseRef = useRef(onClose);
  useEffect(() => {
    onCloseRef.current = onClose;
  });

  useEffect(() => {
    if (!open) return;
    const panel = panelRef.current;
    // Where focus goes back to, settled now: the trigger, or failing that
    // whatever had focus as the dialog opened.
    const returnTo =
      returnFocusRef?.current ??
      (document.activeElement instanceof HTMLElement ? document.activeElement : null);
    (initialFocusRef?.current ?? panel)?.focus({ preventScroll: true });
    const unlockScroll = lockBodyScroll(document.body, {
      scrollbarWidth: window.innerWidth - document.documentElement.clientWidth,
      paddingRight: parseFloat(getComputedStyle(document.body).paddingRight) || 0,
    });

    const onKeyDown = (event: KeyboardEvent) => {
      if (isDismissKey(event)) {
        // Taken on the way down and stopped here, so a drawer this dialog was
        // opened from does not close underneath it on the same key.
        event.preventDefault();
        event.stopPropagation();
        onCloseRef.current();
        return;
      }
      if (event.key !== "Tab" || !panel) return;
      const active = document.activeElement instanceof HTMLElement ? document.activeElement : null;
      const target = trapFocusTarget(
        tabbablesIn(panel),
        active,
        panel,
        event.shiftKey,
        active !== null && panel.contains(active),
      );
      if (target) {
        event.preventDefault();
        target.focus();
      }
    };

    // Focus that lands outside some other way (a screen reader's cursor, a
    // script) is brought back, so nothing behind the dialog can be operated.
    const onFocusIn = (event: FocusEvent) => {
      if (panel && event.target instanceof Node && !panel.contains(event.target)) {
        panel.focus({ preventScroll: true });
      }
    };

    window.addEventListener("keydown", onKeyDown, true);
    document.addEventListener("focusin", onFocusIn);
    return () => {
      window.removeEventListener("keydown", onKeyDown, true);
      document.removeEventListener("focusin", onFocusIn);
      unlockScroll();
      if (returnTo?.isConnected) returnTo.focus();
    };
  }, [open, initialFocusRef, returnFocusRef]);

  // Closing on a press that starts and ends outside the panel, so a text
  // selection dragged out of the panel does not dismiss it.
  const onBackdropPointerDown = (event: ReactPointerEvent<HTMLDivElement>) => {
    pressedOutside.current = event.target === event.currentTarget;
  };
  const onBackdropClick = (event: ReactMouseEvent<HTMLDivElement>) => {
    if (closeOnBackdrop && pressedOutside.current && event.target === event.currentTarget) {
      onClose();
    }
    pressedOutside.current = false;
  };

  const motionSet = reduceMotion ? FADED : TILTED;

  const content = (
    <ModalContext.Provider value={{ close: onClose }}>
      <AnimatePresence>
        {open ? (
          <ModalLayer key="modal">
            <motion.div
              className="absolute inset-0 bg-backdrop backdrop-blur-md"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.2, ease: "easeOut" }}
            />
            <div
              className="absolute inset-0 flex items-center justify-center p-3 perspective-midrange sm:p-6"
              onPointerDown={onBackdropPointerDown}
              onClick={onBackdropClick}
            >
              <motion.div
                ref={panelRef}
                role="dialog"
                aria-modal="true"
                aria-labelledby={labelledBy}
                aria-describedby={describedBy}
                tabIndex={-1}
                className={cn(
                  // The panel takes focus only so a screen reader announces
                  // the dialog; it is not a control, so it draws no ring.
                  "relative flex max-h-[90dvh] w-full flex-col overflow-hidden rounded-modal border border-border bg-overlay text-foreground shadow-e3 outline-none!",
                  className,
                )}
                initial={motionSet.initial}
                animate={motionSet.animate}
                exit={motionSet.exit}
                transition={reduceMotion ? FADE : SPRING}
              >
                {children}
              </motion.div>
            </div>
          </ModalLayer>
        ) : null}
      </AnimatePresence>
    </ModalContext.Provider>
  );

  if (!portal) return content;
  if (typeof document === "undefined") return null;
  return createPortal(content, container ?? document.body);
}

/**
 * The fixed layer over the page. Once closing it is inert while it animates
 * out: clicks reach the page again and assistive technology has already left
 * it, rather than both waiting on the spring to settle.
 */
function ModalLayer({ children }: { children: ReactNode }) {
  const present = useIsPresent();
  return (
    <motion.div className="fixed inset-0 z-80" inert={!present}>
      {children}
    </motion.div>
  );
}

/** The title row: the heading and description on the left, close on the right. */
export function ModalHeader({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <div
      className={cn(
        "flex shrink-0 items-start justify-between gap-3 border-b border-separator py-3 pl-4 pr-2.5 sm:py-4 sm:pl-6 sm:pr-4",
        className,
      )}
    >
      {children}
    </div>
  );
}

/** The scrolling middle. The header and footer stay put around it. */
export function ModalContent({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <div className={cn("min-h-0 flex-1 overflow-y-auto overscroll-contain px-4 py-5 sm:px-6", className)}>
      {children}
    </div>
  );
}

/** The shaded strip along the bottom, for the dialog's actions. */
export function ModalFooter({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <div
      className={cn(
        "flex shrink-0 flex-wrap items-center justify-end gap-2 border-t border-separator bg-surface-muted px-4 py-3 sm:px-6",
        className,
      )}
    >
      {children}
    </div>
  );
}

/** The close button, with Aceternity's grow-and-tip on hover. */
export function ModalClose({ label = "Close", className }: { label?: string; className?: string }) {
  const { close } = useModal();
  return (
    <button
      type="button"
      onClick={close}
      aria-label={label}
      className={cn(
        "group/close grid size-10 shrink-0 place-items-center rounded-ctl text-foreground-muted transition hover:bg-surface-muted hover:text-foreground",
        className,
      )}
    >
      <X
        className="size-4.5 transition duration-200 motion-safe:group-hover/close:rotate-3 motion-safe:group-hover/close:scale-125"
        aria-hidden
      />
    </button>
  );
}
