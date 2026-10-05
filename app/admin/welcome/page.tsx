import { Inbox } from "lucide-react";
import { prisma } from "@/lib/db";
import { runWelcomeSweepAction } from "@/app/admin/actions";
import {
  Card,
  CardHeader,
  EmptyState,
  PageHeader,
  Stat,
  buttonClass,
} from "@/components/app/ui";
import { PendingButton } from "@/components/ui/pending-button";
import {
  getWelcomeSetting,
  MAX_BODY_LENGTH,
  MAX_DELAY_MINUTES,
  upcomingWelcomeMessages,
  welcomeMessageCounts,
} from "@/lib/messages/welcome";
import { WelcomeForm, type SenderOption } from "./welcome-form";

export const dynamic = "force-dynamic";

export const metadata = {
  title: "Welcome DM",
};

export default async function AdminWelcomePage() {
  const [setting, counts, upcoming, staff] = await Promise.all([
    getWelcomeSetting(),
    welcomeMessageCounts(),
    upcomingWelcomeMessages(),
    prisma.user.findMany({
      where: {
        status: "ACTIVE",
        roles: { some: { role: { name: { in: ["HOST", "ADMIN", "SUPER_ADMIN"] } } } },
      },
      select: {
        id: true,
        email: true,
        handle: true,
        profile: { select: { displayName: true } },
      },
      orderBy: { createdAt: "asc" },
    }),
  ]);

  const senders: SenderOption[] = staff.map((user) => ({
    id: user.id,
    label: `${user.profile?.displayName ?? user.handle} (${user.email})`,
  }));

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        eyebrow="Admin"
        title="Welcome DM"
        description="A direct message that arrives a set time after a member signs in for the first time ever — not on every sign-in, and not by email. Each member can only ever receive one."
      />

      <dl className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Stat label="Sent" value={counts.sent} />
        <Stat label="Waiting to send" value={counts.pending} />
        <Stat label="Cancelled" value={counts.canceled} />
        <Stat
          label="Errored"
          value={counts.failed}
          tone={counts.failed > 0 ? "bad" : "default"}
        />
      </dl>

      <Card padding="none">
        <CardHeader
          title="Settings"
          description={
            setting.updatedAt
              ? `Last saved ${setting.updatedAt.toLocaleString()}.`
              : "Never saved — showing the defaults, and sending is off."
          }
        />
        <div className="p-4 sm:p-5">
          <WelcomeForm
            initial={{
              enabled: setting.enabled,
              body: setting.body,
              delayMinutes: setting.delayMinutes,
              senderId: setting.senderId,
            }}
            senders={senders}
            maxDelayMinutes={MAX_DELAY_MINUTES}
            maxBodyLength={MAX_BODY_LENGTH}
          />
        </div>
      </Card>

      <Card padding="none">
        {/* CardHeader's layout, except that the action drops under the
            description on a phone instead of squeezing it to one word a line. */}
        <div className="flex flex-col gap-3 border-b border-separator px-4 py-3 sm:flex-row sm:items-center sm:justify-between sm:px-5">
          <div className="min-w-0">
            <h2 className="flex items-center gap-2 text-body font-semibold text-foreground">
              Queue
              <span className="text-label font-medium tabular-nums text-foreground-muted">
                {upcoming.length}
              </span>
            </h2>
            <p className="mt-0.5 text-caption text-foreground-muted">
              A cron sweeps this on a timer. You can also run it now.
            </p>
          </div>
          <form action={runWelcomeSweepAction} className="shrink-0">
            <PendingButton className={buttonClass({ size: "sm" })}>
              Send anything due
            </PendingButton>
          </form>
        </div>

        {upcoming.length === 0 ? (
          <EmptyState
            size="sm"
            bordered={false}
            icon={<Inbox />}
            title="Nothing waiting."
            description="New members wait here until their welcome DM is due."
          />
        ) : (
          <ul className="divide-y divide-separator">
            {upcoming.map((job) => (
              <li
                key={job.id}
                className="flex flex-col gap-0.5 px-4 py-3 sm:flex-row sm:items-baseline sm:justify-between sm:gap-4 sm:px-5"
              >
                <span className="min-w-0 truncate text-label font-medium text-foreground">
                  {job.user.profile?.displayName ?? job.user.handle}
                </span>
                <span className="text-caption text-foreground-muted sm:text-right">
                  due {job.dueAt.toLocaleString()}
                  {job.failedAt ? (
                    <span className="block text-danger sm:ml-2 sm:inline">
                      · last attempt failed: {job.lastError ?? "unknown error"}
                    </span>
                  ) : null}
                </span>
              </li>
            ))}
          </ul>
        )}
      </Card>
    </div>
  );
}
