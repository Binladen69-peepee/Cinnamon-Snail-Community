import { notFound, redirect } from "next/navigation";
import { auth } from "@/auth";
import { AppShell } from "@/components/app/app-shell";
import { ProfileView } from "@/components/profile/profile-view";
import { getMemberProfile } from "@/lib/community/profile";
import { uploadsConfigured } from "@/lib/uploads/storage";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ handle: string }>;
}) {
  const { handle } = await params;
  return { title: `@${handle}` };
}

export default async function MemberProfilePage({
  params,
}: {
  params: Promise<{ handle: string }>;
}) {
  const session = await auth();
  if (!session?.user.id) redirect("/login");

  const { handle } = await params;
  const profile = await getMemberProfile(session.user.id, handle);
  if (!profile) notFound();

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
      />
    </AppShell>
  );
}
