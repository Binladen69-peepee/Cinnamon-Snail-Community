import { auth } from "@/auth";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/db";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import {
  addEmailAction,
  revokeOtherSessionsAction,
  setPasswordAction,
  updateProfileAction,
} from "@/app/(member)/settings/actions";
import { readPrivacy } from "@/lib/community/privacy";

export default async function SettingsPage({
  searchParams,
}: {
  searchParams: Promise<{ saved?: string }>;
}) {
  const session = await auth();
  if (!session?.user.id) redirect("/login");
  const user = await prisma.user.findUnique({
    where: { id: session.user.id },
    include: { profile: true, emails: true, sessions: true },
  });
  if (!user?.profile) redirect("/home");
  const saved = (await searchParams).saved === "1";
  const privacy = readPrivacy(user.profile.privacy);
  const interests = Array.isArray(user.profile.cookingInterests)
    ? (user.profile.cookingInterests as string[]).join(", ")
    : "";
  const dietary = Array.isArray(user.profile.dietaryInterests)
    ? (user.profile.dietaryInterests as string[]).join(", ")
    : "";
  const links = Array.isArray(user.profile.links)
    ? (user.profile.links as string[]).join(", ")
    : "";

  return (
    <div className="mx-auto max-w-2xl space-y-10">
      <div>
        <h1 className="font-display text-4xl text-forest">Your profile</h1>
        <p className="mt-3 text-muted">
          City-level location only. We never store a home address on your profile.{" "}
          <a href="/billing" className="text-olive underline-offset-2 hover:underline">
            Review membership and billing
          </a>
          .
        </p>
        {saved ? (
          <p className="mt-4 rounded-2xl bg-sage/40 px-4 py-3 text-sm text-forest" role="status">
            Profile saved. The directory will use these details.
          </p>
        ) : null}
      </div>
      <form action={updateProfileAction} className="space-y-4">
        <Input name="displayName" defaultValue={user.profile.displayName} required />
        <Input name="avatarUrl" defaultValue={user.image ?? ""} placeholder="Avatar URL" />
        <Textarea name="bio" defaultValue={user.profile.bio ?? ""} placeholder="Bio" />
        <div className="grid gap-3 md:grid-cols-3">
          <Input name="city" defaultValue={user.profile.city ?? ""} placeholder="City" />
          <Input name="region" defaultValue={user.profile.region ?? ""} placeholder="Region" />
          <Input name="country" defaultValue={user.profile.country ?? ""} placeholder="Country" />
        </div>
        <Input name="skillLevel" defaultValue={user.profile.skillLevel ?? ""} placeholder="Skill level" />
        <Input name="cookingInterests" defaultValue={interests} placeholder="Cooking interests, comma separated" />
        <Input name="dietaryInterests" defaultValue={dietary} placeholder="Dietary interests, comma separated" />
        <Input name="links" defaultValue={links} placeholder="Links, comma separated" />
        <label className="block text-sm">
          Direct messages
          <select
            name="dmPreference"
            defaultValue={user.profile.dmPreference}
            className="mt-2 min-h-11 w-full rounded-2xl border border-sand px-4"
          >
            <option value="EVERYONE">Everyone</option>
            <option value="CONNECTIONS">Connections</option>
            <option value="NOBODY">Nobody</option>
          </select>
        </label>
        <fieldset className="space-y-2 rounded-2xl border border-sand px-4 py-3">
          <legend className="text-sm font-medium text-forest">Privacy</legend>
          <label className="flex min-h-11 items-center gap-2 text-sm">
            <input
              type="checkbox"
              name="directoryVisible"
              defaultChecked={user.profile.directoryVisible}
            />
            Show me in the member directory
          </label>
          <label className="flex min-h-11 items-center gap-2 text-sm">
            <input type="checkbox" name="showLocation" defaultChecked={privacy.showLocation} />
            Show city and region on my profile
          </label>
          <label className="flex min-h-11 items-center gap-2 text-sm">
            <input type="checkbox" name="showInterests" defaultChecked={privacy.showInterests} />
            Show cooking and dietary interests
          </label>
          <label className="flex min-h-11 items-center gap-2 text-sm">
            <input type="checkbox" name="showLinks" defaultChecked={privacy.showLinks} />
            Show my links
          </label>
        </fieldset>
        <Button type="submit">Save profile</Button>
      </form>

      <form action={setPasswordAction} className="space-y-3">
        <h2 className="font-display text-2xl text-forest">Optional password</h2>
        <Input type="password" name="password" minLength={10} required placeholder="At least 10 characters" />
        <Button type="submit" variant="secondary">
          Set password
        </Button>
      </form>

      <form action={addEmailAction} className="space-y-3">
        <h2 className="font-display text-2xl text-forest">More emails</h2>
        <p className="text-sm text-muted">
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

      <form action={revokeOtherSessionsAction}>
        <h2 className="font-display text-2xl text-forest">Sessions</h2>
        <p className="mb-3 text-sm text-muted">{user.sessions.length} session records on file.</p>
        <Button type="submit" variant="danger">
          Sign out everywhere
        </Button>
      </form>
    </div>
  );
}
