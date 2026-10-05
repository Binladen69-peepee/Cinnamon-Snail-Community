import { clsx, type ClassValue } from "clsx";
import { extendTailwindMerge } from "tailwind-merge";

/**
 * tailwind-merge only knows Tailwind's default scales. Without these, the
 * app's own radii (`rounded-card`) never replaced a `rounded-xl` passed in by
 * a caller, its shadows (`shadow-e2`) were filed as shadow *colours*, and its
 * type scale (`text-label`) would be mistaken for a text colour and dropped
 * next to `text-foreground`. Registered here, an override on a primitive
 * actually overrides.
 */
const twMerge = extendTailwindMerge({
  extend: {
    theme: {
      radius: ["chip", "ctl", "card", "modal"],
      shadow: ["e1", "e2", "e3", "lift"],
      text: ["micro", "caption", "label", "body", "reading", "title", "heading", "display"],
    },
  },
});

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export function formatRelativeTime(date: Date | string): string {
  const then = date instanceof Date ? date : new Date(date);
  const delta = Date.now() - then.getTime();
  const minutes = Math.round(delta / 60000);
  if (minutes < 1) return "just now";
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.round(hours / 24);
  if (days < 14) return `${days}d ago`;
  return then.toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
  });
}

export function displayNameFromEmail(email: string): string {
  const local = email.split("@")[0] ?? "Member";
  return local
    .replace(/[._-]+/g, " ")
    .replace(/\b\w/g, (c) => c.toUpperCase());
}
