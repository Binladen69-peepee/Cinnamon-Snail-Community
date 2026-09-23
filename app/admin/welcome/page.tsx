import { prisma } from "@/lib/db";
import { Button } from "@/components/ui/button";
import { runWelcomeSweepAction } from "@/app/admin/actions";
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
    <div className="space-y-10">
      <div>
        <p className="text-[10.5px] font-bold uppercase tracking-[0.13em] text-foreground-muted">Admin</p>
        <h1 className="mt-2 font-display text-[1.55rem] font-bold tracking-[-0.02em] text-foreground">Welcome DM</h1>
        <p className="mt-3 max-w-2xl text-foreground-muted">
          A direct message that arrives a set time after a member signs in for
          the first time ever — not on every sign-in, and not by email. Each
          member can only ever receive one.
        </p>
      </div>

      <dl className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Stat label="Sent" value={counts.sent} />
        <Stat label="Waiting to send" value={counts.pending} />
        <Stat label="Cancelled" value={counts.canceled} />
        <Stat
          label="Errored"
          value={counts.failed}
          tone={counts.failed > 0 ? "danger" : undefined}
        />
      </dl>

      <section className="rounded-card border border-border bg-surface p-5">
        <h2 className="text-[13.5px] font-bold text-foreground">Settings</h2>
        <p className="mt-1 text-sm text-foreground-muted">
          {setting.updatedAt
            ? `Last saved ${setting.updatedAt.toLocaleString()}.`
            : "Never saved — showing the defaults, and sending is off."}
        </p>
        <div className="mt-5">
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
      </section>

      <section className="rounded-card border border-border bg-surface p-5">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <h2 className="text-[13.5px] font-bold text-foreground">Queue</h2>
            <p className="mt-1 text-sm text-foreground-muted">
              A cron sweeps this on a timer. You can also run it now.
            </p>
          </div>
          <form action={runWelcomeSweepAction}>
            <Button type="submit" variant="secondary">
              Send anything due
            </Button>
          </form>
        </div>

        {upcoming.length === 0 ? (
          <p className="mt-5 text-sm text-foreground-muted">
            Nothing waiting.
          </p>
        ) : (
          <ul className="mt-5 divide-y divide-border">
            {upcoming.map((job) => (
              <li
                key={job.id}
                className="flex flex-wrap items-baseline justify-between gap-2 py-2.5"
              >
                <span className="text-sm font-semibold text-foreground">
                  {job.user.profile?.displayName ?? job.user.handle}
                </span>
                <span className="text-sm text-foreground-muted">
                  due {job.dueAt.toLocaleString()}
                  {job.failedAt ? (
                    <span className="ml-2 text-danger">
                      · last attempt failed: {job.lastError ?? "unknown error"}
                    </span>
                  ) : null}
                </span>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}

function Stat({
  label,
  value,
  tone,
}: {
  label: string;
  value: number;
  tone?: "danger";
}) {
  return (
    <div className="rounded-card border border-border bg-surface p-5">
      <dt className="text-sm text-foreground-muted">{label}</dt>
      <dd
        className={`font-display text-3xl ${tone === "danger" ? "text-danger" : "text-foreground"}`}
      >
        {value}
      </dd>
    </div>
  );
}
