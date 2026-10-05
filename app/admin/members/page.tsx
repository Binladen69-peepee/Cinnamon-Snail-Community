import Link from "next/link";
import { ShieldCheck, Users } from "lucide-react";
import {
  listMembers,
  parseMemberFilter,
  type MemberFilter,
} from "@/lib/admin/members";
import { Avatar } from "@/components/ui/avatar";
import {
  Badge,
  ButtonLink,
  Card,
  ChipLink,
  ChipRow,
  EmptyState,
  PageHeader,
  Pager,
  Table,
  Td,
  Th,
  Tr,
} from "@/components/app/ui";
import { AdminSearch } from "@/components/admin/admin-search";

export const metadata = { title: "Members" };

const FILTER_LABEL: Record<MemberFilter, string> = {
  all: "Everyone",
  paying: "Paying",
  lapsed: "Lapsed",
  staff: "Staff",
  new: "New this month",
};

/** The most senior staff role first, so the badge names the one that matters. */
const STAFF_ROLE_LABEL: [string, string][] = [
  ["SUPER_ADMIN", "Super admin"],
  ["ADMIN", "Admin"],
  ["MODERATOR", "Moderator"],
  ["HOST", "Host"],
];

/** A stored enum ("PAST_DUE") as a person would say it ("Past due"). */
function humanize(value: string) {
  const words = value.toLowerCase().replace(/_/g, " ");
  return words.charAt(0).toUpperCase() + words.slice(1);
}

/**
 * The member directory.
 *
 * Previously unreachable: only `/admin/members/[id]` existed, so a member could
 * be opened only by someone who already knew their database id.
 *
 * Search, filter and page all live in the URL, so a support conversation can be
 * handed over as a link. Access comes from the entitlement rules rather than a
 * column, so the badge cannot disagree with what the member app lets them in to.
 */
export default async function AdminMembersPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; filter?: string; page?: string }>;
}) {
  const params = await searchParams;
  const filter = parseMemberFilter(params.filter);
  const q = (params.q ?? "").trim();
  const page = Number.parseInt(params.page ?? "1", 10);

  const data = await listMembers({
    q,
    filter,
    page: Number.isFinite(page) ? page : 1,
  });

  function href(next: { filter?: MemberFilter; page?: number }) {
    const search = new URLSearchParams();
    if (q) search.set("q", q);
    const f = next.filter ?? filter;
    if (f !== "all") search.set("filter", f);
    if (next.page && next.page > 1) search.set("page", String(next.page));
    const query = search.toString();
    return query ? `/admin/members?${query}` : "/admin/members";
  }

  const narrowed = Boolean(q) || filter !== "all";

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title="Members"
        description={
          narrowed
            ? `${data.total} of ${data.totalUnfiltered} accounts`
            : `${data.totalUnfiltered} accounts in the school.`
        }
      >
        <div className="flex flex-col gap-3">
          <AdminSearch
            placeholder="Search by name, handle or email"
            label="Search members"
            resetParams={["page"]}
          />
          <ChipRow label="Filter members">
            {(Object.keys(FILTER_LABEL) as MemberFilter[]).map((option) => (
              <ChipLink key={option} href={href({ filter: option })} active={option === filter}>
                {FILTER_LABEL[option]}
              </ChipLink>
            ))}
          </ChipRow>
        </div>
      </PageHeader>

      <Card padding="none" className="overflow-hidden">
        {data.rows.length === 0 ? (
          <EmptyState
            bordered={false}
            icon={<Users />}
            title={q ? `No member matches “${q}”` : "Nobody in this group"}
            description="Search covers display name, handle and the account email."
            action={
              narrowed ? (
                <ButtonLink href="/admin/members" size="sm">
                  Show everyone
                </ButtonLink>
              ) : undefined
            }
          />
        ) : (
          <Table
            head={
              <>
                <Th>Member</Th>
                <Th className="hidden md:table-cell">Access</Th>
                <Th className="hidden lg:table-cell">Subscription</Th>
                <Th className="hidden sm:table-cell">Joined</Th>
                <Th className="hidden text-right xl:table-cell">Posts</Th>
              </>
            }
          >
            {data.rows.map((row) => {
              const staffRole = row.isStaff
                ? (STAFF_ROLE_LABEL.find(([role]) => row.roles.includes(role))?.[1] ?? "Staff")
                : null;
              return (
                <Tr key={row.id}>
                  <Td>
                    <Link
                      href={`/admin/members/${row.id}`}
                      className="group flex items-center gap-3 no-underline"
                    >
                      <Avatar name={row.name} src={row.avatarUrl} size="sm" />
                      <span className="flex min-w-0 max-w-48 flex-col sm:max-w-64 lg:max-w-80">
                        <span className="flex min-w-0 items-center gap-1.5">
                          <span className="truncate text-label font-semibold text-foreground transition group-hover:text-brand-strong">
                            {row.name}
                          </span>
                          {staffRole ? (
                            <Badge tone="brand" icon={<ShieldCheck aria-hidden />}>
                              {staffRole}
                            </Badge>
                          ) : null}
                          {row.status !== "ACTIVE" ? (
                            <Badge tone="danger">{humanize(row.status)}</Badge>
                          ) : null}
                        </span>
                        <span className="truncate text-caption text-foreground-muted">
                          {row.email ?? `@${row.handle}`}
                        </span>
                      </span>
                    </Link>
                  </Td>
                  <Td className="hidden md:table-cell">
                    {row.hasAccess ? (
                      <Badge tone="success">Active</Badge>
                    ) : (
                      <Badge tone="neutral">No access</Badge>
                    )}
                  </Td>
                  <Td className="hidden text-foreground-muted lg:table-cell">
                    {row.subscriptionStatus ? humanize(row.subscriptionStatus) : "—"}
                  </Td>
                  <Td className="hidden whitespace-nowrap tabular-nums text-foreground-muted sm:table-cell">
                    {row.joinedAt.toLocaleDateString("en-GB", {
                      day: "numeric",
                      month: "short",
                      year: "numeric",
                    })}
                  </Td>
                  <Td className="hidden text-right tabular-nums text-foreground-muted xl:table-cell">
                    {row.posts}
                  </Td>
                </Tr>
              );
            })}
          </Table>
        )}
      </Card>

      {data.pageCount > 1 ? (
        <Pager
          prevHref={data.page > 1 ? href({ page: data.page - 1 }) : null}
          nextHref={data.page < data.pageCount ? href({ page: data.page + 1 }) : null}
          summary={`Page ${data.page} of ${data.pageCount}`}
        />
      ) : null}
    </div>
  );
}
