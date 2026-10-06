import { redirect } from "next/navigation";
import { CalendarDays, UserPlus, Users } from "lucide-react";
import { auth } from "@/auth";
import { loadViewerCrews, type ViewerCrews } from "@/lib/crews/views";
import { AppShell } from "@/components/app/app-shell";
import {
  ButtonLink,
  Callout,
  EmptyState,
  ErrorState,
  PageHeader,
  Section,
} from "@/components/app/ui";
import { CrewList } from "@/components/crews/crew-list";
import { crewMessage } from "@/components/crews/crew-messages";

export const dynamic = "force-dynamic";
export const metadata = { title: "Crews" };

/**
 * Crews (DEC-078): the small groups a member belongs to, and the opt-in ones
 * they can join. Each crew has its own page and its own group chat.
 *
 * Members are put in a few crews automatically — the season they started,
 * their roadmap, and what they told the welcome survey — and choose the rest.
 */
export default async function CrewsPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string; joined?: string; left?: string }>;
}) {
  const session = await auth();
  if (!session?.user.id) redirect("/login?callbackUrl=/crews");
  const params = await searchParams;
  const notice = crewMessage(params);

  let data: ViewerCrews | null = null;
  try {
    data = await loadViewerCrews(session.user.id);
  } catch (cause) {
    console.error("[crews] load failed", cause);
  }

  return (
    <AppShell>
      <div className="flex flex-col gap-8">
        <div className="flex flex-col gap-6">
          <PageHeader
            title="Crews"
            description="Small groups of members who have something in common, each with its own group chat."
            back={{ href: "/connect", label: "Connect" }}
          />
          {notice ? (
            <Callout tone={notice.tone} role={notice.tone === "danger" ? "alert" : "status"}>
              {notice.text}
            </Callout>
          ) : null}
        </div>

        {!data ? (
          <ErrorState
            title="Crews didn’t load"
            description="Something went wrong on our side. Reload the page in a moment."
            action={<ButtonLink href="/crews">Reload</ButtonLink>}
          />
        ) : (
          <>
            <Section title="Your crews" icon={<Users />} count={data.mine.length}>
              {data.mine.length === 0 ? (
                <EmptyState
                  icon={<Users />}
                  title="You’re not in a crew yet"
                  description="You join your start-season crew, your roadmap crew and any survey crews automatically. Crews are updated once a day. In the meantime, join one of the crews below."
                />
              ) : (
                <CrewList crews={data.mine} variant="mine" returnTo="/crews" />
              )}
              {!data.mine.some((crew) => crew.kind === "COHORT") ? (
                <p className="flex items-start gap-2 text-label text-foreground-muted">
                  <CalendarDays className="mt-0.5 size-4 shrink-0" aria-hidden />
                  {data.startKnown
                    ? "Your start-season crew appears after the next daily update."
                    : "Your start-season crew appears once we have the date you first subscribed to Vegan University."}
                </p>
              ) : null}
            </Section>

            <Section
              title="Crews you can join"
              description="Open to every member. Other members can see who is in them."
              icon={<UserPlus />}
              count={data.joinable.length}
            >
              {data.joinable.length === 0 ? (
                <EmptyState
                  size="sm"
                  icon={<Users />}
                  title="You’re in every crew you can join"
                  description="Leave one from its page whenever you like."
                />
              ) : (
                <CrewList crews={data.joinable} variant="joinable" returnTo="/crews" />
              )}
            </Section>
          </>
        )}
      </div>
    </AppShell>
  );
}
