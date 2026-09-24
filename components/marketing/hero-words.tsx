import { Fragment, type CSSProperties } from "react";

/**
 * A headline that arrives one word at a time.
 *
 * Each word is its own inline block with an index the stylesheet turns into a
 * delay, so the stagger is pure CSS and costs no JavaScript. The full sentence
 * is given to assistive technology in one piece through the parent's label;
 * the spans are hidden from it, because a screen reader pausing at every word
 * boundary is worse than no animation at all.
 */
export function HeroWords({ text }: { text: string }) {
  const words = text.split(" ");
  return (
    <span aria-hidden>
      {words.map((word, index) => (
        <Fragment key={`${index}-${word}`}>
          <span
            className="vu-hero-word"
            style={{ "--i": index } as CSSProperties}
          >
            {word}
          </span>
          {index < words.length - 1 ? " " : null}
        </Fragment>
      ))}
    </span>
  );
}
