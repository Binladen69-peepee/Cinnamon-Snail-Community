import Link from "next/link";
import { CalendarClock, ClipboardList, RefreshCw, UsersRound } from "lucide-react";
import { loadCrewsConsole, type CrewsConsole } from "@/lib/crews/admin";
import { CREW_KIND_LABEL } from "@/lib/crews/labels";
import { formatShortTime } from "@/lib/community/format-count";
import { PendingButton } from "@/components/ui/pending-button";
import {
  Badge,
  Callout,
  Card,
  CardHeader,
  EmptyState,
  ErrorState,
  PageHeader,
  Stat,
  Table,
  Td,
  Th,
  Tr,
  buttonClass,
} from "@/components/app/ui";
import { recomputeCrewsAction } from "./actions";

export const dynamic = "force-dynamic";
export const maxDuration = 60;
export const metadata = { title: "Crews" };

const NOTICES: Record<string, { tone: "success" | "danger"; text: string }> = {
  ran: { tone: "success", text: "Crews recomputed. The numbers below are from that run." },
  busy: { tone: "danger", text: "That has run several times already. Give it ten minutes." },
  failed: { tone: "danger", text: "The recompute failed. Nothing was half-applied; try again shortly." },
};

/**
 * The crews console (DEC-078): every crew with its member counts, the last
 * recompute, and where the data behind the automatic crews stands — SamCart
 * start dates for the cohorts, Kit survey answers for the survey crews.
 *
 * Nothing here edits a crew's members by hand: the automatic crews follow
 * their rules and the opt-in ones follow the members.
 */
export default async function AdminCrewsPage({
  searchParams,
}: {
  searchParams: Promise<{ ran?: string; error?: string }>;
}) {
  const params = await searchParams;
  const notice = params.error
    ? (NOTICES[params.error] ?? NOTICES.failed)
    : params.ran
      ? NOTICES.ran
      : null;

  let data: CrewsConsole | null = null;
  try {
    data = await loadCrewsConsole();
  } catch (cause) {
    console.error("[admin/crews] load failed", cause);
  }

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title="Crews"
        description="Automatic crews are rebuilt every day from SamCart start dates, roadmaps and survey answers in Kit. Opt-in crews are only ever joined by members."
        actions={
          <form action={recomputeCrewsAction}>
            <PendingButton className={buttonClass({ variant: "primary" })}>
              <RefreshCw className="size-4" aria-hidden />
              Recompute now
            </PendingButton>
          </form>
        }
      />

      {notice ? (
        <Callout tone={notice.tone} role={notice.tone === "danger" ? "alert" : "status"}>
          {notice.text}
        </Callout>
      ) : null}

      {!data ? (
        <ErrorState
          title="The crews console didn’t load"
          description="Something went wrong reading the crews. Reload in a moment."
        />
      ) : (
        <Console data={data} />
      )}
    </div>
  );
}

function when(date: Date | null | undefined) {
  if (!date) return "never";
  const short = formatShortTime(date);
  // "3h" reads as a duration on its own; "3h ago" reads as a time.
  return /^\d+[mhd]$/.test(short) ? `${short} ago` : short;
}

function Console({ data }: { data: CrewsConsole }) {
  const recompute = data.recompute && !("error" in data.recompute.result) ? data.recompute : null;
  const survey = data.survey?.result;
  const samcart = data.samcart?.result;

  return (
    <>
      <dl className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Stat
          label="Last recompute"
          value={when(data.recompute?.at)}
          hint={
            recompute
              ? `${recompute.result.added} added · ${recompute.result.removed} removed`
              : "Runs every day, or press Recompute now."
          }
        />
        <Stat
          label="Members considered"
          value={recompute ? recompute.result.members : "—"}
          hint="Active members with access, and staff."
        />
        <Stat
          label="No known start date"
          value={recompute ? recompute.result.withoutStart : "—"}
          tone={recompute && recompute.result.withoutStart > 0 ? "warn" : "default"}
          hint="No start-season crew until SamCart gives one."
        />
        <Stat
          label="Survey answers read"
          value={data.kit.synced}
          hint={`${data.kit.neverSynced} members not read yet`}
        />
      </dl>

      <Card padding="none" className="overflow-hidden">
        <CardHeader title="All crews" icon={<UsersRound />} count={data.crews.length} />
        {data.crews.length === 0 ? (
          <EmptyState
            size="sm"
            bordered={false}
            icon={<UsersRound />}
            title="No crews yet"
            description="The survey and opt-in crews come with the database; the rest appear on the first recompute."
          />
        ) : (
          <Table
            head={
              <>
                <Th>Crew</Th>
                <Th>Kind</Th>
                <Th>Rule</Th>
                <Th className="text-right">Automatic</Th>
                <Th className="text-right">Opted in</Th>
                <Th>Chat</Th>
              </>
            }
          >
            {data.crews.map((crew) => (
              <Tr key={crew.id}>
                <Td>
                  <Link
                    href={`/crews/${crew.slug}`}
                    className="font-semibold text-foreground no-underline hover:underline"
                  >
                    {crew.name}
                  </Link>
                  {crew.archived ? (
                    <Badge tone="neutral" className="ml-2">
                      Archived
                    </Badge>
                  ) : null}
                </Td>
                <Td className="whitespace-nowrap text-foreground-muted">
                  {CREW_KIND_LABEL[crew.kind]}
                </Td>
                <Td className="whitespace-nowrap font-mono text-caption text-foreground-muted">
                  {crew.ruleKey ?? "members choose"}
                </Td>
                <Td className="text-right tabular-nums">{crew.auto}</Td>
                <Td className="text-right tabular-nums">{crew.optIn}</Td>
                <Td>
                  {crew.hasChat ? <Badge tone="success">Open</Badge> : <Badge>Not yet</Badge>}
                </Td>
              </Tr>
            ))}
          </Table>
        )}
      </Card>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        <Card padding="none">
          <CardHeader
            title="Survey answers from Kit"
            description="Gluten-Free Gang, Advanced Cooking Crew and Nooch Newbies come from the RightMessage survey answers stored in Kit custom fields."
            icon={<ClipboardList />}
            action={
              data.kit.configured ? (
                <Badge tone="success">Connected</Badge>
              ) : (
                <Badge tone="warning">Not configured</Badge>
              )
            }
          />
          <div className="flex flex-col gap-4 px-4 py-4 sm:px-5">
            {!data.kit.configured ? (
              <Callout tone="warning">
                Set <code>KIT_API_KEY</code> and <code>KIT_API_SECRET</code>. Until then the
                survey crews stay as they are and nothing is read from Kit.
              </Callout>
            ) : null}

            <div>
              <p className="text-label font-semibold text-foreground">
                {data.kit.mapping.configured
                  ? "Mapping from KIT_SURVEY_FIELDS"
                  : "Default mapping (KIT_SURVEY_FIELDS not set)"}
              </p>
              <ul className="mt-1.5 flex flex-col gap-1 text-label text-foreground-muted">
                {data.kit.rules.map((rule, index) => (
                  <li key={`${rule.trait}-${index}`}>
                    <span className="font-medium text-foreground">{rule.trait}</span>: {rule.text}
                  </li>
                ))}
              </ul>
              {data.kit.mapping.problems.length > 0 ? (
                <Callout tone="danger" className="mt-3" title="Some of KIT_SURVEY_FIELDS was ignored">
                  <ul className="list-disc pl-4">
                    {data.kit.mapping.problems.map((problem) => (
                      <li key={problem}>{problem}</li>
                    ))}
                  </ul>
                </Callout>
              ) : null}
            </div>

            <div className="text-label text-foreground-muted">
              <p>
                Last read <span className="text-foreground">{when(data.survey?.at)}</span>
                {survey && !("error" in survey) ? (
                  <>
                    {" "}
                    · {survey.synced} read · {survey.notFound} not in Kit · {survey.failed} failed
                    {survey.remaining > 0 ? ` · ${survey.remaining} waiting` : ""}
                  </>
                ) : null}
              </p>
              {survey && !("error" in survey) && survey.stoppedEarly ? (
                <p className="mt-1">Stopped: {survey.stoppedEarly}.</p>
              ) : null}
              {survey && !("error" in survey) && survey.fieldKeys.length > 0 ? (
                <p className="mt-2">
                  Custom fields seen on those subscribers:{" "}
                  <span className="font-mono text-caption text-foreground">
                    {survey.fieldKeys.join(", ")}
                  </span>
                </p>
              ) : null}
            </div>
          </div>
        </Card>

        <Card padding="none">
          <CardHeader
            title="SamCart start dates"
            description="Each member's start-season crew comes from the date their SamCart subscription began — never the date they were migrated."
            icon={<CalendarClock />}
            action={
              data.starts.configured ? (
                <Badge tone="success">Connected</Badge>
              ) : (
                <Badge tone="warning">Not configured</Badge>
              )
            }
          />
          <div className="flex flex-col gap-4 px-4 py-4 sm:px-5">
            <dl className="grid grid-cols-2 gap-3 text-label">
              <div>
                <dt className="text-foreground-muted">From the SamCart API</dt>
                <dd className="text-title font-semibold tabular-nums text-foreground">
                  {data.starts.fromApi}
                </dd>
              </div>
              <div>
                <dt className="text-foreground-muted">From webhooks</dt>
                <dd className="text-title font-semibold tabular-nums text-foreground">
                  {data.starts.fromWebhook}
                </dd>
              </div>
              <div>
                <dt className="text-foreground-muted">Still unknown</dt>
                <dd className="text-title font-semibold tabular-nums text-foreground">
                  {data.starts.unknown}
                </dd>
              </div>
              <div>
                <dt className="text-foreground-muted">SamCart had no date</dt>
                <dd className="text-title font-semibold tabular-nums text-foreground">
                  {data.starts.undated}
                </dd>
              </div>
            </dl>
            <p className="text-label text-foreground-muted">
              Last checked <span className="text-foreground">{when(data.samcart?.at)}</span>
              {samcart && !("error" in samcart) ? (
                <>
                  {" "}
                  · {samcart.filled} dated · {samcart.failed} failed
                  {samcart.stoppedEarly ? ` · stopped: ${samcart.stoppedEarly}` : ""}
                </>
              ) : null}
            </p>
            <p className="text-caption text-foreground-muted">
              Members whose access came from the migration, with no SamCart subscription linked
              here yet, have no start date and no start-season crew until one is linked.
            </p>
          </div>
        </Card>
      </div>
    </>
  );
}
