import { PASSWORD_MIN_LENGTH } from "@/lib/auth/password-policy";
import { MEMBER_HOME_PATH } from "@/lib/auth/redirects";
import { signOutEverywhereAction } from "@/app/(auth)/sign-out-action";
import { auth } from "@/auth";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/db";
import Link from "next/link";
import { Mail } from "lucide-react";
import {
  addEmailAction,
  setPasswordAction,
} from "@/app/(member)/settings/actions";
import { readPrivacy } from "@/lib/community/privacy";
import { AppShell } from "@/components/app/app-shell";
import {
  Badge,
  Button,
  Callout,
  Card,
  EmptyState,
  Field,
  FormSection,
  Input,
  PageHeader,
} from "@/components/app/ui";
import { ProfileEditor } from "@/components/profile/profile-editor";
import { uploadsConfigured } from "@/lib/uploads/storage";
import {
  NotificationSettings,
  type PrefMatrix,
} from "@/components/notifications/notification-settings";
import { parsePrefs, PREF_CHANNELS, PREF_ROWS, wants } from "@/lib/notifications/preferences";
import { pushConfigured, vapidPublicKey } from "@/lib/notifications/push";

export const metadata = { title: "Settings" };

export default async function SettingsPage({
  searchParams,
}: {
  searchParams: Promise<{ saved?: string }>;
}) {
  const session = await auth();
  if (!session?.user.id) redirect("/login");
  const [user, options, pushDevices] = await Promise.all([
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
    prisma.pushSubscription.count({ where: { userId: session.user.id } }),
  ]);
  if (!user?.profile) redirect(MEMBER_HOME_PATH);
  const saved = (await searchParams).saved === "1";
  const privacy = readPrivacy(user.profile.privacy);
  // What each switch shows is the effective value: the member's own choice, or
  // the default they would get without one.
  const prefs = parsePrefs(user.profile.notificationPrefs);
  const notificationValues = Object.fromEntries(
    PREF_CHANNELS.map(({ channel }) => [
      channel,
      Object.fromEntries(PREF_ROWS.map(({ category }) => [category, wants(prefs, channel, category)])),
    ]),
  ) as PrefMatrix;
  const links = Array.isArray(user.profile.links)
    ? (user.profile.links as string[]).filter(
        (item): item is string => typeof item === "string",
      )
    : [];

  return (
    <AppShell>
      <div className="flex flex-col gap-10">
        <div className="flex flex-col gap-4">
          <PageHeader
            eyebrow="Settings"
            title="Your profile"
            description={
              <>
                City-level location only. We never store a home address on your profile.{" "}
                <Link
                  href="/billing"
                  className="font-medium text-link underline underline-offset-2 transition hover:text-foreground"
                >
                  Review membership and billing
                </Link>
                .
              </>
            }
          />
          {saved ? (
            <Callout tone="success" role="status">
              Profile saved. The directory will use these details.
            </Callout>
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

        <NotificationSettings
          rows={PREF_ROWS}
          values={notificationValues}
          push={{
            available: pushConfigured(),
            publicKey: vapidPublicKey(),
            devices: pushDevices,
          }}
        />

        <FormSection
          title="Optional password"
          description="Setting a password signs out every other device."
        >
          <Card>
            <form action={setPasswordAction} className="flex flex-col gap-4">
              <Field label="New password" htmlFor="settings-password">
                <Input
                  id="settings-password"
                  type="password"
                  name="password"
                  autoComplete="new-password"
                  minLength={PASSWORD_MIN_LENGTH}
                  required
                  placeholder={`At least ${PASSWORD_MIN_LENGTH} characters`}
                />
              </Field>
              <div>
                <Button type="submit" variant="primary">
                  Set password
                </Button>
              </div>
            </form>
          </Card>
        </FormSection>

        <div id="emails" className="scroll-mt-24">
          <FormSection
            title="More emails"
            description="Verified emails can be used to sign in and to match billing identity later."
          >
            <Card padding="none">
              {user.emails.length === 0 ? (
                <EmptyState
                  size="sm"
                  bordered={false}
                  icon={<Mail />}
                  title="No emails on file yet"
                  description="Add the address you paid with, so a purchase made under it reaches this account."
                />
              ) : (
                <ul className="divide-y divide-separator">
                  {user.emails.map((email) => (
                    <li
                      key={email.id}
                      className="flex items-center justify-between gap-3 px-4 py-3 sm:px-5"
                    >
                      <span className="min-w-0 truncate text-body text-foreground">{email.email}</span>
                      <Badge tone={email.verifiedAt ? "success" : "neutral"} className="capitalize">
                        {email.verifiedAt ? "verified" : "unverified"}
                      </Badge>
                    </li>
                  ))}
                </ul>
              )}
              <form
                action={addEmailAction}
                className="flex flex-col gap-3 border-t border-separator p-4 sm:flex-row sm:items-end sm:p-5"
              >
                <Field label="Email address" htmlFor="settings-email" className="min-w-0 flex-1">
                  <Input
                    id="settings-email"
                    type="email"
                    name="email"
                    required
                    placeholder="Add another email"
                  />
                </Field>
                <Button type="submit" variant="primary" className="self-start sm:self-auto">
                  Add email
                </Button>
              </form>
            </Card>
          </FormSection>
        </div>

        <FormSection title="Sessions">
          <Card>
            <form
              action={signOutEverywhereAction}
              className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between"
            >
              <p className="text-body text-foreground-muted">
                {user.sessions.length} session records on file.
              </p>
              <Button type="submit" variant="danger" className="self-start sm:self-auto">
                Sign out everywhere
              </Button>
            </form>
          </Card>
        </FormSection>
      </div>
    </AppShell>
  );
}
