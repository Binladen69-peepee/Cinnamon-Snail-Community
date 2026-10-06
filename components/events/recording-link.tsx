import Link from "next/link";
import { ArrowUpRight, PlayCircle } from "lucide-react";
import type { RecordingLink as RecordingLinkData } from "@/lib/events/queries";
import { buttonClass } from "@/components/app/ui";

/**
 * "Watch recording", wherever the recording lives: a lesson in the class
 * library, the post it was shared in, or a link staff attached. Only the last
 * leaves the site, so only the last opens a new tab.
 */
export function RecordingLink({
  recording,
  size = "sm",
  variant = "secondary",
}: {
  recording: RecordingLinkData;
  size?: "sm" | "md";
  variant?: "primary" | "secondary";
}) {
  const className = buttonClass({ variant, size });
  if (recording.kind === "url") {
    return (
      <a href={recording.href} target="_blank" rel="noopener noreferrer" className={className}>
        <PlayCircle className="size-4" aria-hidden />
        Watch recording
        <ArrowUpRight className="size-3.5 opacity-70" aria-hidden />
        <span className="sr-only">(opens in a new tab)</span>
      </a>
    );
  }
  return (
    <Link href={recording.href} className={className}>
      <PlayCircle className="size-4" aria-hidden />
      Watch recording
    </Link>
  );
}
