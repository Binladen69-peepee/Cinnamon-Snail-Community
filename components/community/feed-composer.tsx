import Link from "next/link";
import { Calendar, ImageIcon, ListChecks, Video } from "lucide-react";
import { Avatar } from "@/components/ui/avatar";

export function FeedComposer({
  name,
  avatar,
}: {
  name: string;
  avatar: string | null;
}) {
  return (
    <section className="vu-card p-5">
      <Link href="/compose" className="flex items-center gap-3">
        <Avatar name={name} src={avatar} />
        <span className="flex min-h-11 flex-1 items-center rounded-[14px] border border-sand bg-cream px-4 text-sm text-foreground-muted">
          Share something with the community...
        </span>
      </Link>
      <div className="mt-4 flex flex-wrap items-center gap-2">
        <ComposerChip href="/compose?type=IMAGE" icon={ImageIcon} label="Photo" className="text-accent" />
        <ComposerChip href="/compose?type=VIDEO" icon={Video} label="Video" className="text-terracotta" />
        <ComposerChip href="/compose?type=POLL" icon={ListChecks} label="Poll" className="text-deep-forest" />
        <ComposerChip href="/compose?type=EVENT" icon={Calendar} label="Event" className="text-foreground" />
        <Link
          href="/compose"
          className="ml-auto inline-flex h-11 min-w-20 items-center justify-center rounded-full bg-forest px-5 text-sm font-semibold text-white transition hover:-translate-y-px"
        >
          Post
        </Link>
      </div>
    </section>
  );
}

function ComposerChip({
  href,
  icon: Icon,
  label,
  className,
}: {
  href: string;
  icon: typeof ImageIcon;
  label: string;
  className?: string;
}) {
  return (
    <Link
      href={href}
      className={`inline-flex min-h-11 items-center gap-2 rounded-full px-3 text-sm font-semibold hover:bg-mint ${className ?? ""}`}
    >
      <Icon className="size-4" aria-hidden />
      {label}
    </Link>
  );
}
