import Link from "next/link";
import { ChevronLeft, ChevronRight, ShieldCheck, Users } from "lucide-react";
import {
  listMembers,
  parseMemberFilter,
  type MemberFilter,
} from "@/lib/admin/members";
import { Avatar } from "@/components/ui/avatar";
import {
  Badge,
  ChipLink,
  EmptyPanel,
  PageHeader,
  Panel,
  Table,
  Td,
  Th,
  Tr,
} from "@/components/admin/ui";
import { AdminSearch } from "@/components/admin/admin-search";

export const metadata = { title: "Members" };

const FILTER_LABEL: Record<MemberFilter, string> = {
  all: "Everyone",
  paying: "Paying",
  lapsed: "Lapsed",
  staff: "Staff",
  new: "New this month",
};

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

  return (
    <div className="space-y-4">
      <PageHeader
        title="Members"
        subtitle={
          q || filter !== "all"
            ? `${data.total} of ${data.totalUnfiltered} accounts`
            : `${data.totalUnfiltered} accounts in the school.`
        }
      />

      <AdminSearch
        placeholder="Search by name, handle or email"
        label="Search members"
        resetParams={["page"]}
      />

      <ul className="flex flex-wrap gap-1.5">
        {(Object.keys(FILTER_LABEL) as MemberFilter[]).map((option) => (
          <li key={option}>
            <ChipLink href={href({ filter: option })} active={option === filter}>
              {FILTER_LABEL[option]}
            </ChipLink>
          </li>
        ))}
      </ul>

      <Panel>
        {data.rows.length === 0 ? (
          <EmptyPanel
            icon={<Users className="size-6" aria-hidden />}
            title={q ? `No member matches “${q}”` : "Nobody in this group"}
            body="Search covers display name, handle and the account email."
          />
        ) : (
          <Table
            head={
              <>
                <Th>Member</Th>
                <Th className="hidden md:table-cell">Access</Th>
                <Th className="hidden lg:table-cell">Subscription</Th>
                <Th className="hidden sm:table-cell">Joined</Th>
                <Th className="hidden xl:table-cell">Posts</Th>
              </>
            }
          >
            {data.rows.map((row) => (
              <Tr key={row.id}>
                <Td>
                  <Link
                    href={`/admin/members/${row.id}`}
                    className="flex items-center gap-2.5 no-underline"
                  >
                    <Avatar
                      name={row.name}
                      src={row.avatarUrl}
                      size="sm"
                      className="size-8"
                    />
                    <span className="min-w-0">
                      <span className="flex items-center gap-1.5">
                        <span className="truncate text-[13.5px] font-bold text-foreground">
                          {row.name}
                        </span>
                        {row.isStaff ? (
                          <ShieldCheck
                            className="size-3.5 shrink-0 text-brand"
                            aria-label="Staff"
                          />
                        ) : null}
                        {row.status !== "ACTIVE" ? (
                          <Badge tone="bad">{row.status.toLowerCase()}</Badge>
                        ) : null}
                      </span>
                      <span className="block truncate text-[12px] text-foreground-muted">
                        {row.email ?? `@${row.handle}`}
                      </span>
                    </span>
                  </Link>
                </Td>
                <Td className="hidden md:table-cell">
                  {row.hasAccess ? (
                    <Badge tone="good">Active</Badge>
                  ) : (
                    <Badge tone="neutral">No access</Badge>
                  )}
                </Td>
                <Td className="hidden lg:table-cell">
                  <span className="text-[12.5px] text-foreground-muted">
                    {row.subscriptionStatus
                      ? row.subscriptionStatus.toLowerCase().replace("_", " ")
                      : "—"}
                  </span>
                </Td>
                <Td className="hidden whitespace-nowrap text-[12.5px] tabular-nums text-foreground-muted sm:table-cell">
                  {row.joinedAt.toLocaleDateString("en-GB", {
                    day: "numeric",
                    month: "short",
                    year: "numeric",
                  })}
                </Td>
                <Td className="hidden text-[12.5px] tabular-nums text-foreground-muted xl:table-cell">
                  {row.posts}
                </Td>
              </Tr>
            ))}
          </Table>
        )}
      </Panel>

      {data.pageCount > 1 ? (
        <nav
          aria-label="Member pages"
          className="flex items-center justify-between gap-3"
        >
          <PagerLink href={href({ page: data.page - 1 })} disabled={data.page <= 1}>
            <ChevronLeft className="size-4" aria-hidden />
            Previous
          </PagerLink>
          <p className="text-[12.5px] font-semibold tabular-nums text-foreground-muted">
            Page {data.page} of {data.pageCount}
          </p>
          <PagerLink
            href={href({ page: data.page + 1 })}
            disabled={data.page >= data.pageCount}
          >
            Next
            <ChevronRight className="size-4" aria-hidden />
          </PagerLink>
        </nav>
      ) : null}
    </div>
  );
}

function PagerLink({
  href,
  disabled,
  children,
}: {
  href: string;
  disabled: boolean;
  children: React.ReactNode;
}) {
  const base =
    "inline-flex h-9 items-center gap-1 rounded-ctl border border-border px-3 text-[13px] font-semibold no-underline transition";
  if (disabled) {
    return (
      <span
        aria-disabled="true"
        className={`${base} cursor-not-allowed text-foreground-muted opacity-45`}
      >
        {children}
      </span>
    );
  }
  return (
    <Link href={href} className={`${base} text-foreground hover:border-hairline-firm`}>
      {children}
    </Link>
  );
}
