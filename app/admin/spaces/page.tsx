import Link from "next/link";
import { Globe, Lock, Users } from "lucide-react";
import { listAdminSpaces } from "@/lib/admin/spaces";
import { SPACE_KIND_LABEL } from "@/lib/spaces/kinds";
import {
  Badge,
  EmptyPanel,
  PageHeader,
  Panel,
  Table,
  Td,
  Th,
  Tr,
} from "@/components/admin/ui";

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
    <div className="space-y-4">
      <PageHeader
        title="Spaces"
        subtitle={
          spaces.length === 0
            ? "No rooms exist yet."
            : `${spaces.length} rooms${
                quiet > 0 ? `, ${quiet} with nothing posted in 30 days` : ""
              }.`
        }
      />

      <Panel>
        {spaces.length === 0 ? (
          <EmptyPanel
            icon={<Users className="size-6" aria-hidden />}
            title="No rooms yet"
            body="Spaces are created by seeds and by hosts. They will be listed here."
          />
        ) : (
          <Table
            head={
              <>
                <Th>Room</Th>
                <Th className="hidden sm:table-cell">Kind</Th>
                <Th>Access</Th>
                <Th className="hidden md:table-cell">Members</Th>
                <Th className="hidden lg:table-cell">Posts</Th>
                <Th className="hidden xl:table-cell">Last post</Th>
              </>
            }
          >
            {spaces.map((space) => (
              <Tr key={space.id}>
                <Td>
                  <Link
                    href={`/spaces/${space.slug}`}
                    className="text-[13.5px] font-bold text-foreground no-underline hover:text-brand hover:underline"
                  >
                    {space.name}
                  </Link>
                  {space.group ? (
                    <span className="block text-[11.5px] text-foreground-muted">
                      {space.group}
                    </span>
                  ) : null}
                </Td>
                <Td className="hidden text-[12.5px] text-foreground-muted sm:table-cell">
                  {SPACE_KIND_LABEL[space.kind]}
                </Td>
                <Td>
                  {space.visibility === "PRIVATE" ? (
                    <Badge tone="warn">
                      <Lock className="size-3" aria-hidden />
                      Private
                    </Badge>
                  ) : space.visibility === "PUBLIC" ? (
                    <Badge tone="good">
                      <Globe className="size-3" aria-hidden />
                      Public
                    </Badge>
                  ) : (
                    <Badge tone="neutral">Members</Badge>
                  )}
                </Td>
                <Td className="hidden text-[12.5px] tabular-nums text-foreground-muted md:table-cell">
                  {space.members}
                </Td>
                <Td className="hidden text-[12.5px] tabular-nums text-foreground-muted lg:table-cell">
                  {space.posts}
                  {space.postsLast30 > 0 ? (
                    <span className="ml-1.5 text-brand">+{space.postsLast30}</span>
                  ) : null}
                </Td>
                <Td className="hidden whitespace-nowrap text-[12.5px] tabular-nums text-foreground-muted xl:table-cell">
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
      </Panel>
    </div>
  );
}
