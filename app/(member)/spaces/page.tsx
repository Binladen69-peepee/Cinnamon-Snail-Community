import Link from "next/link";
import { redirect } from "next/navigation";
import { Globe, Lock, Star, UserPlus } from "lucide-react";
import { auth } from "@/auth";
import { EmptyState } from "@/components/ui/empty-state";
import { listNavSpaces, type NavSpace } from "@/lib/spaces";
import {
  SPACE_KIND_BLURB,
  SPACE_KIND_ICON,
  SPACE_KIND_LABEL,
} from "@/lib/spaces/kinds";
import { joinSpaceAction } from "@/app/(member)/spaces/actions";
import { cn } from "@/lib/utils";

export const metadata = { title: "Spaces" };

/**
 * The space directory.
 *
 * Grouped the same way the rail is, so the two agree about how the community is
 * organised. Each card says what kind of room it is and who can see it, because
 * "Course Hall" alone does not tell a new member whether they are allowed in or
 * what they would find.
 */
export default async function SpacesPage() {
  const session = await auth();
  if (!session?.user.id) redirect("/login");

  const { favorites, groups } = await listNavSpaces(session.user.id);

  if (groups.length === 0) {
    return (
      <EmptyState
        title="Spaces are being prepared"
        body="Hosts will open kitchens, course rooms and event spaces here."
      />
    );
  }

  const joinedCount = groups
    .flatMap((group) => group.spaces)
    .filter((space) => space.joined).length;

  return (
    <div className="space-y-6">
      <header>
        <h1 className="font-display text-[1.75rem] font-bold leading-tight tracking-tight text-forest md:text-[2rem]">
          Spaces
        </h1>
        <p className="mt-1.5 text-[15px] text-foreground-muted">
          Each space has a host, a purpose, and a table of its own. You are in{" "}
          {joinedCount} of them.
        </p>
      </header>

      {favorites.length > 0 ? (
        <section>
          <h2 className="mb-3 flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-[0.13em] text-foreground-muted">
            <Star className="size-3 fill-current" aria-hidden />
            Favourites
          </h2>
          <div className="grid gap-3 sm:grid-cols-2">
            {favorites.map((space) => (
              <SpaceCard key={space.id} space={space} />
            ))}
          </div>
        </section>
      ) : null}

      {groups.map((group) => (
        <section key={group.id ?? "ungrouped"}>
          <h2 className="mb-3 text-[11px] font-bold uppercase tracking-[0.13em] text-foreground-muted">
            {group.name}
          </h2>
          <div className="grid gap-3 sm:grid-cols-2">
            {group.spaces.map((space) => (
              <SpaceCard key={space.id} space={space} />
            ))}
          </div>
        </section>
      ))}
    </div>
  );
}

function SpaceCard({ space }: { space: NavSpace }) {
  const KindIcon = SPACE_KIND_ICON[space.kind];
  const VisibilityIcon = space.visibility === "PRIVATE" ? Lock : Globe;

  return (
    <article
      className={cn(
        "flex h-full flex-col overflow-hidden rounded-card border bg-surface transition-colors",
        space.unread > 0 ? "border-brand/35" : "border-border/70",
        "hover:border-brand/40",
      )}
    >
      <Link href={`/spaces/${space.slug}`} className="block flex-1 no-underline">
        {/* The cover band is always present. A space without art gets a tinted
            panel carrying its kind icon, so every card in a row is the same
            shape and the grid has no holes in it. */}
        <span className="relative block aspect-16/6 overflow-hidden bg-mint">
          {space.coverUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={space.coverUrl}
              alt=""
              loading="lazy"
              decoding="async"
              className="size-full object-cover"
            />
          ) : (
            <span className="grid size-full place-items-center bg-brand-wash" aria-hidden>
              <KindIcon className="size-7 text-brand/40" />
            </span>
          )}
        </span>

        <span className="block p-4">
          <span className="flex items-start gap-2.5">
            <span
              className="grid size-9 shrink-0 place-items-center rounded-ctl bg-brand-wash text-brand-strong"
              aria-hidden
            >
              <KindIcon className="size-[1.05rem]" />
            </span>
            <span className="min-w-0 flex-1">
              <span className="flex flex-wrap items-center gap-x-2 gap-y-1">
                <span className="min-w-0 truncate text-[15px] font-bold text-foreground">
                  {space.name}
                </span>
                {space.unread > 0 ? (
                  <span className="shrink-0 rounded-full bg-brand px-1.5 text-[10.5px] font-bold tabular-nums text-[#06120d]">
                    {space.unread >= 50 ? "50+" : space.unread} new
                  </span>
                ) : null}
              </span>
              <span className="mt-0.5 block line-clamp-2 text-[13px] leading-snug text-foreground-muted">
                {SPACE_KIND_BLURB[space.kind]}
              </span>
            </span>
          </span>

          <span className="mt-3 flex flex-wrap items-center gap-x-3 gap-y-1 text-[12px] font-semibold text-foreground-muted">
            <span className="inline-flex items-center gap-1">
              <KindIcon className="size-3" aria-hidden />
              {SPACE_KIND_LABEL[space.kind]}
            </span>
            <span className="inline-flex items-center gap-1">
              <VisibilityIcon className="size-3" aria-hidden />
              {space.visibility === "PRIVATE" ? "Private" : "Open"}
            </span>
            <span>
              {space.memberCount} {space.memberCount === 1 ? "member" : "members"}
            </span>
          </span>
        </span>
      </Link>

      {/* Join sits outside the link, so tapping the card opens the space and
          tapping the button joins it. */}
      <div className="mt-auto border-t border-border/60 px-4 py-2.5">
        {space.joined ? (
          <span className="inline-flex items-center gap-1.5 text-[13px] font-bold text-brand">
            <Star className={cn("size-3.5", space.favorite && "fill-current")} aria-hidden />
            {space.favorite ? "Favourite" : "Joined"}
          </span>
        ) : space.visibility === "PRIVATE" ? (
          <span className="text-[13px] font-semibold text-foreground-muted">
            Invitation only
          </span>
        ) : (
          <form action={joinSpaceAction}>
            <input type="hidden" name="spaceId" value={space.id} />
            <input type="hidden" name="slug" value={space.slug} />
            <button
              type="submit"
              className="inline-flex h-8 items-center gap-1.5 rounded-full border border-border px-3 text-[13px] font-bold text-foreground transition hover:border-brand/50 hover:text-brand"
            >
              <UserPlus className="size-3.5" aria-hidden />
              Join
            </button>
          </form>
        )}
      </div>
    </article>
  );
}
