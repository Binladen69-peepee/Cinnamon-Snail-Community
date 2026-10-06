import Link from "next/link";
import type { ClassHost as ClassHostData } from "@/lib/events/queries";
import { Avatar } from "@/components/ui/avatar";
import { cn } from "@/lib/utils";

/**
 * "Hosted by", with a face. A host who is a member here links to their
 * profile; a host Zoom named who is not a member is shown by name only.
 */
export function ClassHost({
  host,
  size = "xs",
  className,
}: {
  host: ClassHostData;
  size?: "xs" | "sm";
  className?: string;
}) {
  return (
    <p
      className={cn(
        "flex min-w-0 items-center gap-2 text-label text-foreground-muted",
        className,
      )}
    >
      <Avatar name={host.name} src={host.image} size={size} />
      <span className="min-w-0 truncate">
        Hosted by{" "}
        {host.handle ? (
          <Link
            href={`/members/${host.handle}`}
            className="font-semibold text-foreground no-underline hover:underline"
          >
            {host.name}
          </Link>
        ) : (
          <span className="font-semibold text-foreground">{host.name}</span>
        )}
      </span>
    </p>
  );
}
