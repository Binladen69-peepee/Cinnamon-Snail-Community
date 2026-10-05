import Link from "next/link";
import { Globe, Lock, Users } from "lucide-react";
import { listAdminSpaces } from "@/lib/admin/spaces";
import { SPACE_KIND_LABEL } from "@/lib/spaces/kinds";
import {
  Badge,
  Card,
  EmptyState,
  PageHeader,
  Table,
  Td,
  Th,
  Tr,
} from "@/components/app/ui";

export const metadata = { title: "Spaces" };

/**
 * Every room in the school, with the numbers that say whether it is alive.
 *
 * Read-only: visibility decides who can see a room and everything said in it,
 * and it is set today by seeds and by hosts in the member app. A second place
 * that can change access is one more than a permission model should have, so
 * this reports rather than edits until the host tools exist.
 */
export default async function AdminSpacesPage() {
  const spaces = await listAdminSpaces();
  const quiet = spaces.filter((space) => space.postsLast30 === 0).length;

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title="Spaces"
        description={
          spaces.length === 0
            ? "No rooms exist yet."
            : `${spaces.length} rooms${
                quiet > 0 ? `, ${quiet} with nothing posted in 30 days` : ""
              }.`
        }
      />

      <Card padding="none" className="overflow-hidden">
        {spaces.length === 0 ? (
          <EmptyState
            bordered={false}
            icon={<Users />}
            title="No rooms yet"
            description="Spaces are created by seeds and by hosts. They will be listed here."
          />
        ) : (
          <Table
            head={
              <>
                <Th>Room</Th>
                <Th className="hidden sm:table-cell">Kind</Th>
                <Th>Access</Th>
                <Th className="hidden text-right md:table-cell">Members</Th>
                <Th className="hidden text-right lg:table-cell">Posts</Th>
                <Th className="hidden xl:table-cell">Last post</Th>
              </>
            }
          >
            {spaces.map((space) => (
              <Tr key={space.id}>
                <Td>
                  <Link
                    href={`/spaces/${space.slug}`}
                    className="font-semibold text-foreground no-underline transition hover:text-brand-strong"
                  >
                    {space.name}
                  </Link>
                  {space.group ? (
                    <span className="block text-caption text-foreground-muted">
                      {space.group}
                    </span>
                  ) : null}
                </Td>
                <Td className="hidden text-foreground-muted sm:table-cell">
                  {SPACE_KIND_LABEL[space.kind]}
                </Td>
                <Td>
                  {space.visibility === "PRIVATE" ? (
                    <Badge tone="warning" icon={<Lock aria-hidden />}>
                      Private
                    </Badge>
                  ) : space.visibility === "PUBLIC" ? (
                    <Badge tone="success" icon={<Globe aria-hidden />}>
                      Public
                    </Badge>
                  ) : (
                    <Badge tone="neutral">Members</Badge>
                  )}
                </Td>
                <Td className="hidden text-right tabular-nums text-foreground-muted md:table-cell">
                  {space.members}
                </Td>
                <Td className="hidden whitespace-nowrap text-right tabular-nums text-foreground-muted lg:table-cell">
                  {space.posts}
                  {space.postsLast30 > 0 ? (
                    <span className="ml-1.5 font-medium text-brand-strong">
                      +{space.postsLast30}
                    </span>
                  ) : null}
                </Td>
                <Td className="hidden whitespace-nowrap tabular-nums text-foreground-muted xl:table-cell">
                  {space.lastPostAt
                    ? space.lastPostAt.toLocaleDateString("en-GB", {
                        day: "numeric",
                        month: "short",
                        year: "numeric",
                      })
                    : "Never"}
                </Td>
              </Tr>
            ))}
          </Table>
        )}
      </Card>
    </div>
  );
}
