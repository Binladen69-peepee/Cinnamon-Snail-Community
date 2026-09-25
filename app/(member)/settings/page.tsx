import { PASSWORD_MIN_LENGTH } from "@/lib/auth/password-policy";
import { signOutEverywhereAction } from "@/app/(auth)/sign-out-action";
import { auth } from "@/auth";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/db";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import {
  addEmailAction,
  setPasswordAction,
} from "@/app/(member)/settings/actions";
import { readPrivacy } from "@/lib/community/privacy";
import { AppShell } from "@/components/app/app-shell";
import { ProfileEditor } from "@/components/profile/profile-editor";
import { uploadsConfigured } from "@/lib/uploads/storage";

export default async function SettingsPage({
  searchParams,
}: {
  searchParams: Promise<{ saved?: string }>;
}) {
  const session = await auth();
  if (!session?.user.id) redirect("/login");
  const [user, options] = await Promise.all([
    prisma.user.findUnique({
      where: { id: session.user.id },
      include: {
        profile: {
          include: {
            interests: { select: { interest: { select: { slug: true } } } },
          },
        },
        emails: true,
        sessions: true,
      },
    }),
    // The catalog, in the order it is offered. Read from the table rather than
    // the file so a deploy that has not yet run the sync job cannot offer an
    // option the save would then reject.
    prisma.interest.findMany({
      orderBy: { sortOrder: "asc" },
      select: { slug: true, label: true, kind: true },
    }),
  ]);
  if (!user?.profile) redirect("/home");
  const saved = (await searchParams).saved === "1";
  const privacy = readPrivacy(user.profile.privacy);
  const links = Array.isArray(user.profile.links)
    ? (user.profile.links as string[]).filter(
        (item): item is string => typeof item === "string",
      )
    : [];

  return (
    <AppShell>
      <div className="mx-auto max-w-2xl space-y-10 pb-10">
      <div>
        <h1 className="font-display text-[1.6rem] sm:text-3xl text-foreground">Your profile</h1>
        <p className="mt-3 text-foreground-muted">
          City-level location only. We never store a home address on your profile.{" "}
          <a href="/billing" className="text-foreground-muted underline-offset-2 hover:underline">
            Review membership and billing
          </a>
          .
        </p>
        {saved ? (
          <p className="mt-4 rounded-2xl bg-sage/40 px-4 py-3 text-sm text-foreground" role="status">
            Profile saved. The directory will use these details.
          </p>
        ) : null}
      </div>
      <ProfileEditor
        profile={{
          handle: user.handle,
          displayName: user.profile.displayName,
          avatarUrl: user.profile.avatarUrl,
          bio: user.profile.bio,
          cookingLately: user.profile.cookingLately,
          city: user.profile.city,
          region: user.profile.region,
          country: user.profile.country,
          skill: user.profile.skill,
          links,
          interests: user.profile.interests.map((row) => row.interest.slug),
          dmPreference: user.profile.dmPreference,
          directoryVisible: user.profile.directoryVisible,
          showLocation: privacy.showLocation,
          showLinks: privacy.showLinks,
          showInterests: privacy.showInterests,
        }}
        options={options}
        uploadsEnabled={uploadsConfigured()}
      />

      <form action={setPasswordAction} className="space-y-3">
        <h2 className="font-display text-2xl text-foreground">Optional password</h2>
        <Input
          type="password"
          name="password"
          autoComplete="new-password"
          minLength={PASSWORD_MIN_LENGTH}
          required
          placeholder={`At least ${PASSWORD_MIN_LENGTH} characters`}
        />
        <p className="text-sm text-foreground-muted">
          Setting a password signs out every other device.
        </p>
        <Button type="submit" variant="secondary">
          Set password
        </Button>
      </form>

      <form action={addEmailAction} className="space-y-3">
        <h2 className="font-display text-2xl text-foreground">More emails</h2>
        <p className="text-sm text-foreground-muted">
          Verified emails can be used to sign in and to match billing identity later.
        </p>
        <ul className="text-sm">
          {user.emails.map((email) => (
            <li key={email.id}>
              {email.email} {email.verifiedAt ? "(verified)" : "(unverified)"}
            </li>
          ))}
        </ul>
        <Input type="email" name="email" required placeholder="Add another email" />
        <Button type="submit" variant="secondary">
          Add email
        </Button>
      </form>

      <form action={signOutEverywhereAction}>
        <h2 className="font-display text-2xl text-foreground">Sessions</h2>
        <p className="mb-3 text-sm text-foreground-muted">{user.sessions.length} session records on file.</p>
        <Button type="submit" variant="danger">
          Sign out everywhere
        </Button>
      </form>
      </div>
    </AppShell>
  );
}
