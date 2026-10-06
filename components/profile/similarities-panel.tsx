import Link from "next/link";
import { ArrowRight, ChevronDown, HeartHandshake, Pencil } from "lucide-react";
import { ButtonLink, chipClass } from "@/components/app/ui";
import { Skeleton } from "@/components/ui/skeleton";
import { getEventViewer } from "@/lib/events/access";
import {
  loadSimilarities,
  type Similarity,
  type SimilarityGroup,
} from "@/lib/social/similarities";

/**
 * "Show similarities" on another member's profile.
 *
 * Collapsed by default and expandable: a native `<details>`, so it opens with
 * the keyboard and without JavaScript, and announces its state for free. The
 * panel is computed on the server (`loadSimilarities`), streamed in behind the
 * profile so it never holds the page up, and renders nothing at all when there
 * must be no panel (a block, a member hidden from the directory).
 */
export async function SimilaritiesPanel({
  viewerId,
  memberId,
  memberName,
}: {
  viewerId: string;
  memberId: string;
  memberName: string;
}) {
  let similarity: Similarity | null;
  let timeZone = "UTC";
  try {
    const [loaded, eventViewer] = await Promise.all([
      loadSimilarities(viewerId, memberId),
      getEventViewer(viewerId),
    ]);
    similarity = loaded;
    timeZone = eventViewer?.timeZone ?? "UTC";
  } catch (error) {
    console.error("[profile] similarities failed", error);
    return (
      <Shell summary="Similarities didn’t load">
        <p className="text-body text-foreground-muted">
          Something went wrong on our side. Reload the page to try again.
        </p>
      </Shell>
    );
  }
  if (!similarity) return null;

  const first = memberName.trim().split(/\s+/)[0] || memberName;

  return (
    <Shell
      summary={
        similarity.count > 0
          ? `${similarity.count} ${similarity.count === 1 ? "thing" : "things"} in common`
          : "Nothing in common yet"
      }
    >
      {similarity.count === 0 ? (
        <div className="flex flex-col items-start gap-3">
          <p className="max-w-[60ch] text-body text-foreground-muted text-pretty">
            Nothing you and {first} both show on your profiles matches yet. Interests, skill
            level, city, crews and classes are what get compared.
          </p>
          <ButtonLink href="/settings" size="sm">
            <Pencil className="size-4" aria-hidden />
            Fill in your profile
          </ButtonLink>
        </div>
      ) : (
        <div className="flex flex-col gap-5">
          <div className="grid grid-cols-1 gap-5 sm:grid-cols-2">
            {similarity.groups.map((group) => (
              <Group key={group.key} group={group} timeZone={timeZone} />
            ))}
          </div>
          <div className="flex flex-col gap-2 border-t border-separator pt-4 sm:flex-row sm:items-center sm:justify-between">
            <p className="text-caption text-foreground-muted text-pretty">
              Only what you both choose to show on your profiles is compared.
            </p>
            <Link
              href="/members?view=similar"
              className="inline-flex shrink-0 items-center gap-1 text-label font-medium text-link no-underline hover:underline"
            >
              More members like you
              <ArrowRight className="size-4" aria-hidden />
            </Link>
          </div>
        </div>
      )}
    </Shell>
  );
}

function Shell({ summary, children }: { summary: string; children: React.ReactNode }) {
  return (
    <details className="group rounded-card border border-border bg-surface shadow-e1">
      <summary className="flex cursor-pointer list-none items-center gap-3 rounded-card px-4 py-3 transition hover:bg-surface-muted sm:px-5 [&::-webkit-details-marker]:hidden">
        <span
          className="grid size-8 shrink-0 place-items-center rounded-full bg-brand-wash text-on-brand-wash"
          aria-hidden
        >
          <HeartHandshake className="size-4" />
        </span>
        <span className="min-w-0 flex-1">
          <span className="block text-body font-semibold text-foreground">
            <span className="group-open:hidden">Show similarities</span>
            <span className="hidden group-open:inline">Hide similarities</span>
          </span>
          <span className="block text-caption text-foreground-muted">{summary}</span>
        </span>
        <ChevronDown
          className="size-4 shrink-0 text-foreground-muted transition group-open:rotate-180"
          aria-hidden
        />
      </summary>
      <div className="border-t border-separator px-4 py-4 sm:px-5">{children}</div>
    </details>
  );
}

function Group({ group, timeZone }: { group: SimilarityGroup; timeZone: string }) {
  const date = new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
    timeZone: safeZone(timeZone),
  });
  return (
    <section className="flex min-w-0 flex-col gap-2">
      <h3 className="text-micro font-semibold uppercase tracking-[0.08em] text-foreground-muted">
        {group.title}
      </h3>
      {group.display === "chips" ? (
        <ul className="flex flex-wrap gap-1.5">
          {group.entries.map((entry) => (
            <li key={entry.key}>
              {entry.href ? (
                <Link
                  href={entry.href}
                  className={chipClass(false)}
                  title={`Find other members who picked ${entry.label}`}
                >
                  {entry.label}
                </Link>
              ) : (
                <span className={chipClass(false)}>{entry.label}</span>
              )}
            </li>
          ))}
        </ul>
      ) : (
        <ul className="flex flex-col gap-1.5">
          {group.entries.map((entry) => (
            <li key={entry.key} className="text-body text-foreground">
              {entry.href ? (
                <Link
                  href={entry.href}
                  className="font-medium text-foreground no-underline hover:text-brand-strong hover:underline"
                >
                  {entry.label}
                </Link>
              ) : (
                entry.label
              )}
              {entry.date ? (
                <span className="text-label text-foreground-muted">
                  {" "}
                  · <time dateTime={entry.date.toISOString()}>{date.format(entry.date)}</time>
                </span>
              ) : null}
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

function safeZone(zone: string): string {
  try {
    new Intl.DateTimeFormat("en-US", { timeZone: zone });
    return zone;
  } catch {
    return "UTC";
  }
}

/** The panel's place while it streams in: the closed row, unpressable. */
export function SimilaritiesSkeleton() {
  return (
    <div
      className="flex items-center gap-3 rounded-card border border-border bg-surface px-4 py-3 shadow-e1 sm:px-5"
      aria-hidden
    >
      <Skeleton className="size-8 shrink-0 rounded-full" />
      <div className="flex flex-1 flex-col gap-1.5">
        <Skeleton className="h-4 w-36 rounded-chip" />
        <Skeleton className="h-3 w-24 rounded-chip" />
      </div>
      <Skeleton className="size-4 rounded-chip" />
    </div>
  );
}
