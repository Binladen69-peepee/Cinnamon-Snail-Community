import { SOCIAL_LINKS } from "@/lib/marketing/social";
import { SocialGlyph } from "@/components/marketing/social-icons";
import { cn } from "@/lib/utils";

/**
 * The social row.
 *
 * Sizing follows the existing nav icon system: a round tap target with a small
 * glyph inside. `footer` is the prominent variant; the two `hero` variants are
 * deliberately quieter and sit in a corner so they never compete with the
 * single call to action.
 *
 * Every link opens in a new tab. `rel="noreferrer"` also covers `noopener` in
 * every browser that supports `noreferrer`, but both are set explicitly so the
 * intent is obvious.
 */
export function SocialLinks({
  variant,
  className,
}: {
  variant: "footer" | "heroDark" | "heroLight";
  className?: string;
}) {
  const footer = variant === "footer";

  const button = footer
    ? "inline-flex size-11 items-center justify-center rounded-full bg-white/10 text-[var(--cta-fill-foreground)] transition hover:-translate-y-0.5 hover:bg-white/20 hover:text-accent"
    : cn(
        "inline-flex size-9 items-center justify-center rounded-full border transition hover:-translate-y-0.5",
        variant === "heroDark"
          ? "border-white/20 bg-white/10 text-white/80 backdrop-blur-sm hover:bg-white/20 hover:text-white"
          : "border-sand bg-surface/80 text-olive backdrop-blur-sm hover:border-accent hover:text-forest",
      );

  const glyph = footer ? "size-[1.1rem]" : "size-4";

  return (
    <ul
      className={cn("flex items-center", footer ? "gap-2.5" : "gap-1.5", className)}
    >
      {SOCIAL_LINKS.map((link) => (
        <li key={link.href}>
          <a
            href={link.href}
            target="_blank"
            rel="noopener noreferrer"
            aria-label={link.label}
            title={link.name}
            className={button}
          >
            <SocialGlyph icon={link.icon} className={glyph} />
          </a>
        </li>
      ))}
    </ul>
  );
}
