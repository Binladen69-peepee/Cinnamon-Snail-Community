import { redirect } from "next/navigation";
import { CalendarDays, Handshake, RotateCw, Store, type LucideIcon } from "lucide-react";
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
import { ButtonLink, Callout, ErrorState, PageHeader, TabBar, TabLink } from "@/components/app/ui";
import { HappeningsTab } from "@/components/bulletin/happenings-tab";
import { ServicesTab } from "@/components/bulletin/services-tab";
import { PlacesTab } from "@/components/bulletin/places-tab";

export const metadata = { title: "Bulletin Board" };

const TABS: { tab: BulletinTab; label: string; icon: LucideIcon }[] = [
  { tab: "happenings", label: "Happenings", icon: CalendarDays },
  { tab: "services", label: "Member services", icon: Handshake },
  { tab: "places", label: "Vegan places", icon: Store },
];

const NOTICES: Record<string, string> = {
  hosted: "Your gathering is on the board, and posted in the Kitchen Table.",
  going: "You’re on the guest list.",
  requested: "Request sent. The host will let you know.",
  canceled: "Called off. Guests have been told, and its Kitchen Table post now says so.",
  card: "Sent for review. It appears once staff approve it.",
  removed: "Your card is off the board.",
  place: "Thanks. It is added once staff have checked it.",
  testimonial: "Thanks for sharing.",
};

/**
 * The Bulletin Board — BUILD.md §19, under Community.
 *
 * Three tabs as links, because the tab is server state: it decides which
 * query runs, survives a reload, and can be sent to someone. Each tab's rules
 * live in `lib/bulletin`; each tab's markup in `components/bulletin`.
 *
 * Every live item is also a post in the Kitchen Table (DEC-078). The board
 * shows that post's reactions and comments under the item, and each item
 * links to its post, as the post links back here.
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
  const viewer = {
    name: session.user.name || session.user.handle,
    avatar: session.user.image ?? null,
  };

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
      <div className="flex flex-col gap-6">
        <PageHeader
          title="Bulletin Board"
          description="Gatherings, skills and vegan places from members near you. Only your city is ever shown, and each one is also a Kitchen Table post with the same comments."
        >
          <TabBar label="Bulletin Board sections">
            {TABS.map(({ tab: value, label, icon: Icon }) => (
              <TabLink
                key={value}
                href={value === "happenings" ? "/bulletin" : `/bulletin?tab=${value}`}
                active={value === tab}
              >
                <Icon aria-hidden />
                {label}
              </TabLink>
            ))}
          </TabBar>
        </PageHeader>

        {error ? (
          <Callout tone="danger" role="alert">
            {error}
          </Callout>
        ) : null}
        {notice ? (
          <Callout tone="success" role="status">
            {notice}
          </Callout>
        ) : null}

        {!loaded ? (
          <ErrorState
            title="The board didn’t load"
            description="Something went wrong on our side. Reload the page in a moment."
            action={
              <ButtonLink href={tab === "happenings" ? "/bulletin" : `/bulletin?tab=${tab}`}>
                <RotateCw className="size-4" aria-hidden />
                Reload
              </ButtonLink>
            }
          />
        ) : loaded.tab === "happenings" ? (
          <HappeningsTab
            happenings={loaded.data}
            kind={kind}
            viewerZone={viewerZone}
            defaults={defaults}
            viewer={viewer}
          />
        ) : loaded.tab === "services" ? (
          <ServicesTab
            cards={loaded.data.cards}
            own={loaded.data.own}
            q={q}
            category={category}
            defaultCity={defaults.city}
            viewer={viewer}
          />
        ) : (
          <PlacesTab
            places={loaded.data.places}
            pending={loaded.data.pending}
            q={q}
            category={category}
            defaults={defaults}
            viewer={viewer}
          />
        )}
      </div>
    </AppShell>
  );
}
