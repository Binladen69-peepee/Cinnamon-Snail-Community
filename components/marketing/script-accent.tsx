import { cn } from "@/lib/utils";
import { splitOnAccent } from "@/lib/marketing/accent";

/**
 * Renders a headline with one phrase set in the handwritten face, the way
 * "Belong" is treated in "Learn. Cook. Belong."
 *
 * The copy strings in lib/marketing/copy.ts are the client's signed-off text
 * and stay untouched — the accent phrase is located inside the string at render
 * time rather than the headline being re-typed as JSX, so the wording can never
 * drift from the source. If the phrase is not found the text renders whole and
 * unstyled, which is the safe failure.
 */
export function ScriptAccent({
  text,
  accent,
  tone = "light",
  className,
}: {
  text: string;
  /** Exact substring of `text` to set in the script face. */
  accent: string;
  /** `dark` lightens the accent so it reads on the video hero / forest panels. */
  tone?: "light" | "dark";
  className?: string;
}) {
  const parts = splitOnAccent(text, accent);

  return (
    <span className={className}>
      {parts.before}
      {parts.matched ? (
        <span
          className={cn(
            "vu-script-word",
            tone === "dark" && "vu-script-word-invert",
          )}
        >
          {parts.accent}
        </span>
      ) : null}
      {parts.after}
    </span>
  );
}
