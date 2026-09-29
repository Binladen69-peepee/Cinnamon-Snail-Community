import Link from "next/link";
import { redirect } from "next/navigation";
import { CalendarDays, ClipboardList, Handshake, Store, type LucideIcon } from "lucide-react";
import { auth } from "@/auth";
import { prisma } from "@/lib/db";
import { safeTimeZone } from "@/lib/events/timezone";
import {
  bulletinErrorText,
  loadHappenings,
  loadPlaces,
  loadServices,
  parseTab,
  type BulletinTab,
} from "@/lib/bulletin";
import { AppShell } from "@/components/app/app-shell";
import { HappeningsTab } from "@/components/bulletin/happenings-tab";
import { ServicesTab } from "@/components/bulletin/services-tab";
import { PlacesTab } from "@/components/bulletin/places-tab";
import { Blank } from "@/components/bulletin/ui";
import { cn } from "@/lib/utils";

export const metadata = { title: "Bulletin board" };

const TABS: { tab: BulletinTab; label: string; icon: LucideIcon }[] = [
  { tab: "happenings", label: "Happenings", icon: CalendarDays },
  { tab: "services", label: "Member services", icon: Handshake },
  { tab: "places", label: "Vegan places", icon: Store },
];

const NOTICES: Record<string, string> = {
  hosted: "Your gathering is on the board.",
  going: "You’re on the guest list.",
  requested: "Request sent. The host will let you know.",
  canceled: "Called off. Guests have been told.",
  card: "Sent for review. It appears once staff approve it.",
  place: "Thanks. It is added once staff have checked it.",
  testimonial: "Thanks for sharing.",
};

/**
 * The local bulletin board — BUILD.md §19.
 *
 * Three tabs as links, because the tab is server state: it decides which
 * query runs, survives a reload, and can be sent to someone. Each tab's rules
 * live in `lib/bulletin`; each tab's markup in `components/bulletin`.
 */
export default async function BulletinPage({
  searchParams,
}: {
  searchParams: Promise<{
    tab?: string;
    kind?: string;
    q?: string;
    category?: string;
    error?: string;
    notice?: string;
  }>;
}) {
  const session = await auth();
  if (!session?.user.id) redirect("/login?callbackUrl=/bulletin");
  const viewerId = session.user.id;

  const params = await searchParams;
  const tab = parseTab(params.tab);
  const q = (params.q ?? "").trim().slice(0, 80);
  const category = params.category?.trim() || null;
  const error = bulletinErrorText(params.error);
  const notice = params.notice ? (NOTICES[params.notice] ?? null) : null;

  const profile = await prisma.profile
    .findUnique({
      where: { userId: viewerId },
      select: { city: true, region: true, country: true, timezone: true },
    })
    .catch(() => null);
  const defaults = {
    city: profile?.city ?? "",
    region: profile?.region ?? "",
    country: profile?.country ?? "",
  };
  const viewerZone = safeTimeZone(profile?.timezone);

  const kind = params.kind?.trim() || null;
  type Loaded =
    | { tab: "happenings"; data: Awaited<ReturnType<typeof loadHappenings>> }
    | { tab: "services"; data: Awaited<ReturnType<typeof loadServices>> }
    | { tab: "places"; data: Awaited<ReturnType<typeof loadPlaces>> };

  let loaded: Loaded | null = null;
  try {
    loaded =
      tab === "happenings"
        ? { tab, data: await loadHappenings(viewerId, { kind }) }
        : tab === "services"
          ? { tab, data: await loadServices(viewerId, { q, category }) }
          : { tab, data: await loadPlaces(viewerId, { q, category }) };
  } catch (cause) {
    console.error("[bulletin] load failed", cause);
  }

  return (
    <AppShell>
      <div className="space-y-5 pb-4">
        <header>
          <h1 className="font-display text-[1.6rem] font-bold leading-tight tracking-[-0.02em] text-foreground">
            Bulletin board
          </h1>
          <p className="mt-1 text-[14px] text-foreground-muted">
            Gatherings, skills and vegan places from members near you. Only your city is ever shown.
          </p>
        </header>

        <nav aria-label="Bulletin sections" className="-mx-3 px-3 sm:mx-0 sm:px-0">
          <ul className="flex gap-1.5 overflow-x-auto pb-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
            {TABS.map(({ tab: value, label, icon: Icon }) => {
              const current = value === tab;
              return (
                <li key={value}>
                  <Link
                    href={value === "happenings" ? "/bulletin" : `/bulletin?tab=${value}`}
                    aria-current={current ? "page" : undefined}
                    scroll={false}
                    className={cn(
                      "inline-flex h-9 items-center gap-1.5 whitespace-nowrap rounded-full border px-3.5 text-[13.5px] font-semibold no-underline transition",
                      current
                        ? "border-brand-fill bg-brand-fill text-brand-fill-foreground"
                        : "border-border bg-surface text-foreground-muted hover:border-hairline-firm hover:text-foreground",
                    )}
                  >
                    <Icon className="size-3.5" aria-hidden />
                    {label}
                  </Link>
                </li>
              );
            })}
          </ul>
        </nav>

        {error ? (
          <p
            role="alert"
            className="rounded-ctl border border-danger/40 bg-danger/10 px-3.5 py-2.5 text-[13.5px] font-semibold text-danger"
          >
            {error}
          </p>
        ) : null}
        {notice ? (
          <p
            role="status"
            className="rounded-ctl border border-hairline-firm bg-brand-wash px-3.5 py-2.5 text-[13.5px] font-semibold text-on-brand-wash"
          >
            {notice}
          </p>
        ) : null}

        {!loaded ? (
          <div role="alert">
            <Blank
              icon={ClipboardList}
              title="The board didn’t load"
              body="Something went wrong on our side. Reload the page in a moment."
              action={{ href: tab === "happenings" ? "/bulletin" : `/bulletin?tab=${tab}`, label: "Reload" }}
            />
          </div>
        ) : loaded.tab === "happenings" ? (
          <HappeningsTab happenings={loaded.data} kind={kind} viewerZone={viewerZone} defaults={defaults} />
        ) : loaded.tab === "services" ? (
          <ServicesTab
            cards={loaded.data.cards}
            own={loaded.data.own}
            q={q}
            category={category}
            defaultCity={defaults.city}
          />
        ) : (
          <PlacesTab
            places={loaded.data.places}
            pending={loaded.data.pending}
            q={q}
            category={category}
            defaults={defaults}
          />
        )}
      </div>
    </AppShell>
  );
}
