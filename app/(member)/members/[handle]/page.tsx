import { Suspense } from "react";
import { notFound, redirect } from "next/navigation";
import { auth } from "@/auth";
import { AppShell } from "@/components/app/app-shell";
import { ProfileView } from "@/components/profile/profile-view";
import { parseProfileTab } from "@/components/profile/profile-tabs";
import {
  SimilaritiesPanel,
  SimilaritiesSkeleton,
} from "@/components/profile/similarities-panel";
import { getMemberProfile } from "@/lib/community/profile";
import { refreshBadgesThrottled } from "@/lib/social/badges";
import { afterResponse } from "@/lib/after-response";
import { uploadsConfigured } from "@/lib/uploads/storage";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ handle: string }>;
}) {
  const { handle } = await params;
  return { title: `@${handle}` };
}

/**
 * A member's profile.
 *
 * The profile itself renders at once; "Show similarities" streams in behind
 * it, because it reads both members' interests, crews, classes and live
 * classes and the page should not wait for that.
 *
 * Visiting someone's profile is also when their badges catch up with things
 * that happen elsewhere (a class finished, an idea the team planned), at most
 * once every fifteen minutes per member and after the response, so the visit
 * never waits on it. The member's own visit catches up inline instead, so
 * their progress is never shown one step behind.
 */
export default async function MemberProfilePage({
  params,
  searchParams,
}: {
  params: Promise<{ handle: string }>;
  searchParams: Promise<{ tab?: string }>;
}) {
  const { handle } = await params;
  const session = await auth();
  if (!session?.user.id) {
    redirect(`/login?callbackUrl=${encodeURIComponent(`/members/${handle}`)}`);
  }

  const query = await searchParams;
  const profile = await getMemberProfile(session.user.id, handle);
  if (!profile) notFound();

  if (!profile.isOwner) {
    void afterResponse(async () => {
      await refreshBadgesThrottled(profile.userId);
    });
  }

  const viewer = {
    name: session.user.name || session.user.handle,
    avatar: session.user.image ?? null,
  };

  return (
    <AppShell wide flush>
      <ProfileView
        profile={profile}
        viewer={viewer}
        uploadsEnabled={uploadsConfigured()}
        initialTab={parseProfileTab(query.tab)}
        similarities={
          profile.similaritiesAvailable ? (
            <Suspense fallback={<SimilaritiesSkeleton />}>
              <SimilaritiesPanel
                viewerId={session.user.id}
                memberId={profile.userId}
                memberName={profile.displayName}
              />
            </Suspense>
          ) : null
        }
      />
    </AppShell>
  );
}
