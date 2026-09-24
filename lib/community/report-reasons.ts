/**
 * Why someone reported a post.
 *
 * Its own module with no imports, because the report dialog runs in the
 * browser and the check runs on the server, and both must work from the same
 * list. Putting it beside the database code would drag Prisma into a client
 * bundle to render five radio buttons.
 *
 * The reason is most of the value of a report. The interface used to send one
 * fixed string, which told a moderator that something was wrong and nothing
 * whatsoever about what.
 */
export const REPORT_REASONS = [
  { value: "spam", label: "Spam or advertising" },
  { value: "harassment", label: "Harassment or abuse" },
  { value: "off_topic", label: "Off topic for this space" },
  { value: "misinformation", label: "Misleading or unsafe advice" },
  { value: "other", label: "Something else" },
] as const;

export type ReportReason = (typeof REPORT_REASONS)[number]["value"];

export function isReportReason(value: string): value is ReportReason {
  return REPORT_REASONS.some((reason) => reason.value === value);
}
