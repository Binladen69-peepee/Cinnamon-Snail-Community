import { z } from "zod";
import {
  MAX_WEEKS_PER_TOPIC,
  MIN_WEEKS_PER_TOPIC,
  type WeeksPerTopic,
} from "@/lib/roadmap/pacing";

/**
 * What a form may send for a pace (DEC-080): a whole number 1–4, as a number
 * or as the digits a form posts. Anything else (a fraction, "abc", an empty
 * field, a File) is refused rather than rounded into range.
 *
 * Its own module so the client pace control, which imports `pacing.ts` for
 * the option list, does not carry the validator into the browser.
 */
export const weeksPerTopicSchema = z
  .union([
    z.number(),
    z
      .string()
      .trim()
      .regex(/^\d{1,2}$/)
      .transform(Number),
  ])
  .pipe(z.number().int().min(MIN_WEEKS_PER_TOPIC).max(MAX_WEEKS_PER_TOPIC))
  .transform((weeks) => weeks as WeeksPerTopic);

/** A validated pace, or null. Never throws. */
export function parseWeeksPerTopic(value: unknown): WeeksPerTopic | null {
  const parsed = weeksPerTopicSchema.safeParse(value);
  return parsed.success ? parsed.data : null;
}
