import Link from "next/link";
import { GraduationCap, LayoutGrid, List, Plus } from "lucide-react";
import { ALL_CATEGORY, listAdminCourses } from "@/lib/admin/courses";
import { CourseCard, StatusBadge } from "@/components/admin/course-card";
import { NewCourseDialog } from "@/components/admin/new-course-dialog";
import {
  ButtonLink,
  Card,
  ChipLink,
  ChipRow,
  EmptyState,
  PageHeader,
  Segmented,
  Table,
  Td,
  Th,
  Tr,
  segmentClass,
} from "@/components/app/ui";

export const metadata = { title: "Courses" };

/**
 * Course management, to the supplied design.
 *
 * Header with a subtitle and a New course button, a row of category chips, a
 * grid/list toggle, then cards in a three-column grid — each with its cover,
 * category chip, title and a three-cell footer.
 *
 * The chips are the real categories on the real rows rather than the design's
 * fixed five, so a chip can never lead to an empty grid. Category and view both
 * live in the URL: a filtered list is a link, and the toggle survives a reload.
 */
export default async function AdminCoursesPage({
  searchParams,
}: {
  searchParams: Promise<{ category?: string; view?: string; new?: string }>;
}) {
  const params = await searchParams;
  const category = params.category?.trim() || null;
  const view = params.view === "list" ? "list" : "grid";

  const data = await listAdminCourses({ category });

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title="Courses"
        description="Create and manage courses in your school."
        actions={
          <ButtonLink href="/admin/courses?new=1" scroll={false} variant="primary">
            <Plus className="size-4" aria-hidden />
            New course
          </ButtonLink>
        }
      >
        <div className="flex items-center justify-between gap-3">
          <ChipRow label="Category" className="min-w-0 flex-1">
            {[null, ...data.categories].map((tab) => (
              <ChipLink key={tab ?? "all"} href={tabHref(tab, view)} active={tab === category}>
                {tab ?? ALL_CATEGORY}
              </ChipLink>
            ))}
          </ChipRow>

          <Segmented label="Layout" className="shrink-0">
            <ViewLink href={tabHref(category, "grid")} active={view === "grid"} label="Grid view">
              <LayoutGrid aria-hidden />
            </ViewLink>
            <ViewLink href={tabHref(category, "list")} active={view === "list"} label="List view">
              <List aria-hidden />
            </ViewLink>
          </Segmented>
        </div>
      </PageHeader>

      {data.courses.length === 0 ? (
        <EmptyState
          icon={<GraduationCap />}
          title={category ? `Nothing in ${category}` : "No courses yet"}
          description={
            category
              ? "Every other category still has classes in it."
              : "Create your first course and it will appear here."
          }
          action={
            category ? (
              <ButtonLink href={tabHref(null, view)} scroll={false}>
                See every course
              </ButtonLink>
            ) : (
              <ButtonLink href="/admin/courses?new=1" scroll={false} variant="primary">
                <Plus className="size-4" aria-hidden />
                New course
              </ButtonLink>
            )
          }
        />
      ) : view === "grid" ? (
        <ul className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {data.courses.map((course) => (
            <li key={course.id} className="min-w-0">
              <CourseCard course={course} />
            </li>
          ))}
        </ul>
      ) : (
        <Card padding="none" className="overflow-hidden">
          <Table
            head={
              <>
                <Th>Course</Th>
                <Th className="hidden sm:table-cell">Category</Th>
                <Th>Creation date</Th>
                <Th className="hidden sm:table-cell">Sales</Th>
                <Th>Status</Th>
              </>
            }
          >
            {data.courses.map((course) => (
              <Tr key={course.id}>
                <Td className="min-w-40">
                  <Link
                    href={`/admin/courses/${course.slug}/edit`}
                    className="font-semibold text-foreground no-underline transition hover:text-brand-strong"
                  >
                    {course.title}
                  </Link>
                </Td>
                <Td className="hidden text-foreground-muted sm:table-cell">
                  {course.category ?? "—"}
                </Td>
                <Td className="whitespace-nowrap tabular-nums text-foreground-muted">
                  {course.createdAt.toLocaleDateString("en-GB", {
                    day: "numeric",
                    month: "short",
                    year: "numeric",
                  })}
                </Td>
                <Td className="hidden text-foreground-muted sm:table-cell">—</Td>
                <Td>
                  <StatusBadge published={course.published} />
                </Td>
              </Tr>
            ))}
          </Table>
        </Card>
      )}

      <NewCourseDialog open={params.new === "1"} />
    </div>
  );
}

function tabHref(category: string | null, view: "grid" | "list"): string {
  const search = new URLSearchParams();
  if (category) search.set("category", category);
  if (view === "list") search.set("view", "list");
  const query = search.toString();
  return query ? `/admin/courses?${query}` : "/admin/courses";
}

function ViewLink({
  href,
  active,
  label,
  children,
}: {
  href: string;
  active: boolean;
  label: string;
  children: React.ReactNode;
}) {
  return (
    <Link
      href={href}
      scroll={false}
      aria-label={label}
      title={label}
      aria-current={active ? "true" : undefined}
      className={segmentClass(active, "w-8 px-0")}
    >
      {children}
    </Link>
  );
}
