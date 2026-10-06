import Link from "next/link";
import { GraduationCap, LayoutGrid, List, Plus, Shapes } from "lucide-react";
import { listAdminClasses } from "@/lib/learn/categories";
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

type View = "grid" | "list";
type Filter = { category: string | null; unshelved: boolean };

/**
 * Course management, to the supplied design.
 *
 * Header with a subtitle, the category screen and a New course button, a row
 * of category chips, a grid/list toggle, then cards in a three-column grid —
 * each with its cover, category chip, title and a three-cell footer.
 *
 * The chips are the library's real categories (DEC-078), the ones with a class
 * on them, so a chip can never lead to an empty grid; a class on several
 * categories shows under each. "On no shelf" appears only when some class is
 * on none, because that is the list an admin needs to work through. Filter and
 * view both live in the URL: a filtered list is a link, and the toggle
 * survives a reload.
 */
export default async function AdminCoursesPage({
  searchParams,
}: {
  searchParams: Promise<{
    category?: string;
    unshelved?: string;
    view?: string;
    new?: string;
  }>;
}) {
  const params = await searchParams;
  const view: View = params.view === "list" ? "list" : "grid";

  const data = await listAdminClasses({
    category: typeof params.category === "string" ? params.category.trim() || null : null,
    unshelved: params.unshelved === "1",
  });
  const filter: Filter = {
    category: data.category?.slug ?? null,
    unshelved: data.unshelved,
  };
  const filtered = Boolean(filter.category || filter.unshelved);

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title="Courses"
        description="Create and manage courses in your school."
        actions={
          <>
            <ButtonLink href="/admin/courses/categories">
              <Shapes className="size-4" aria-hidden />
              Categories
            </ButtonLink>
            <ButtonLink href="/admin/courses?new=1" scroll={false} variant="primary">
              <Plus className="size-4" aria-hidden />
              New course
            </ButtonLink>
          </>
        }
      >
        <div className="flex items-center justify-between gap-3">
          <ChipRow label="Category" className="min-w-0 flex-1">
            <ChipLink href={listHref({ category: null, unshelved: false }, view)} active={!filtered}>
              All courses
            </ChipLink>
            {data.categories.map((category) => (
              <ChipLink
                key={category.slug}
                href={listHref({ category: category.slug, unshelved: false }, view)}
                active={category.slug === filter.category}
              >
                {category.name}
                <span className="tabular-nums opacity-70">{category.count}</span>
              </ChipLink>
            ))}
            {data.unshelvedCount > 0 ? (
              <ChipLink
                href={listHref({ category: null, unshelved: true }, view)}
                active={filter.unshelved}
              >
                On no shelf
                <span className="tabular-nums opacity-70">{data.unshelvedCount}</span>
              </ChipLink>
            ) : null}
          </ChipRow>

          <Segmented label="Layout" className="shrink-0">
            <ViewLink href={listHref(filter, "grid")} active={view === "grid"} label="Grid view">
              <LayoutGrid aria-hidden />
            </ViewLink>
            <ViewLink href={listHref(filter, "list")} active={view === "list"} label="List view">
              <List aria-hidden />
            </ViewLink>
          </Segmented>
        </div>
      </PageHeader>

      {data.courses.length === 0 ? (
        <EmptyState
          icon={<GraduationCap />}
          title={
            data.category
              ? `Nothing in ${data.category.name}`
              : filter.unshelved
                ? "Every course is on a shelf"
                : "No courses yet"
          }
          description={
            filter.unshelved
              ? "Nothing is waiting for a category."
              : filtered
                ? "Every other category still has classes in it."
                : "Create your first course and it will appear here."
          }
          action={
            filtered ? (
              <ButtonLink href={listHref({ category: null, unshelved: false }, view)} scroll={false}>
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
                <Th className="hidden sm:table-cell">Categories</Th>
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
                  {course.categories.length > 0
                    ? course.categories.map((category) => category.name).join(", ")
                    : "—"}
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

function listHref(filter: Filter, view: View): string {
  const search = new URLSearchParams();
  if (filter.category) search.set("category", filter.category);
  else if (filter.unshelved) search.set("unshelved", "1");
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
