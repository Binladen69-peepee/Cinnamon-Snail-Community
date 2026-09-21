import Link from "next/link";
import { GraduationCap, LayoutGrid, List, Plus } from "lucide-react";
import { ALL_CATEGORY, listAdminCourses } from "@/lib/admin/courses";
import { CourseCard, StatusBadge } from "@/components/admin/course-card";
import { NewCourseDialog } from "@/components/admin/new-course-dialog";
import { cn } from "@/lib/utils";

export const metadata = { title: "Courses" };

/**
 * Course management, to the supplied design.
 *
 * Header with a subtitle and a New Course button, a row of category tabs, a
 * grid/list toggle, then cards in a three-column grid — each with its cover,
 * category chip, title and a three-cell footer.
 *
 * The tabs are the real categories on the real rows rather than the design's
 * fixed five, so a tab can never lead to an empty grid. Tab and view both live
 * in the URL: a filtered list is a link, and the toggle survives a reload.
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
    <div className="space-y-5">
      <header className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="font-display text-[1.6rem] font-bold leading-tight tracking-[-0.02em] text-foreground">
            Courses
          </h1>
          <p className="mt-1 text-[14px] text-foreground-muted">
            Create and manage courses in your school.
          </p>
        </div>

        <Link
          href="/admin/courses?new=1"
          scroll={false}
          className="inline-flex h-10 shrink-0 items-center gap-1.5 rounded-ctl bg-brand-fill px-4 text-[13.5px] font-semibold text-brand-fill-foreground no-underline transition hover:bg-brand-fill-hover"
        >
          <Plus className="size-4" aria-hidden />
          New Course
        </Link>
      </header>

      <div className="flex flex-wrap items-center justify-between gap-2">
        <ul className="-mx-1 flex gap-1 overflow-x-auto px-1 pb-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
          {[null, ...data.categories].map((tab) => {
            const current = tab === category;
            return (
              <li key={tab ?? "all"}>
                <Link
                  href={tabHref(tab, view)}
                  scroll={false}
                  aria-current={current ? "true" : undefined}
                  className={cn(
                    "inline-flex h-8 items-center whitespace-nowrap rounded-ctl border px-3 text-[12.5px] font-semibold no-underline transition",
                    current
                      ? "border-brand-fill bg-brand-fill text-brand-fill-foreground"
                      : "border-border bg-surface text-foreground-muted hover:border-hairline-firm hover:text-foreground",
                  )}
                >
                  {tab ?? ALL_CATEGORY}
                </Link>
              </li>
            );
          })}
        </ul>

        <div
          className="flex shrink-0 items-center gap-0.5 rounded-ctl border border-border bg-surface p-0.5"
          role="group"
          aria-label="Layout"
        >
          <ViewLink
            href={tabHref(category, "grid")}
            active={view === "grid"}
            label="Grid view"
          >
            <LayoutGrid className="size-4" aria-hidden />
          </ViewLink>
          <ViewLink
            href={tabHref(category, "list")}
            active={view === "list"}
            label="List view"
          >
            <List className="size-4" aria-hidden />
          </ViewLink>
        </div>
      </div>

      {data.courses.length === 0 ? (
        <div className="rounded-card border border-dashed border-border bg-surface px-6 py-14 text-center">
          <span className="mx-auto grid size-12 place-items-center rounded-full bg-brand-wash text-brand-strong">
            <GraduationCap className="size-6" aria-hidden />
          </span>
          <h2 className="mt-3 font-display text-[1.15rem] font-bold text-foreground">
            {category ? `Nothing in ${category}` : "No courses yet"}
          </h2>
          <p className="mx-auto mt-1.5 max-w-[42ch] text-[14px] text-foreground-muted">
            {category
              ? "Every other category still has classes in it."
              : "Create your first course and it will appear here."}
          </p>
        </div>
      ) : view === "grid" ? (
        <ul className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {data.courses.map((course) => (
            <li key={course.id}>
              <CourseCard course={course} />
            </li>
          ))}
        </ul>
      ) : (
        <div className="overflow-hidden rounded-card border border-border bg-surface">
          <table className="w-full text-left">
            <thead className="border-b border-border">
              <tr className="text-[10.5px] font-semibold uppercase tracking-[0.1em] text-foreground-muted">
                <th scope="col" className="px-3.5 py-2.5">Course</th>
                <th scope="col" className="hidden px-3.5 py-2.5 sm:table-cell">Category</th>
                <th scope="col" className="px-3.5 py-2.5">Creation Date</th>
                <th scope="col" className="hidden px-3.5 py-2.5 sm:table-cell">Sales</th>
                <th scope="col" className="px-3.5 py-2.5">Status</th>
              </tr>
            </thead>
            <tbody>
              {data.courses.map((course) => (
                <tr key={course.id} className="border-b border-border last:border-b-0">
                  <td className="px-3.5 py-2.5">
                    <Link
                      href={`/admin/courses/${course.slug}/edit`}
                      className="text-[13.5px] font-bold text-foreground no-underline hover:text-brand hover:underline"
                    >
                      {course.title}
                    </Link>
                  </td>
                  <td className="hidden px-3.5 py-2.5 text-[12.5px] text-foreground-muted sm:table-cell">
                    {course.category ?? "—"}
                  </td>
                  <td className="whitespace-nowrap px-3.5 py-2.5 text-[12.5px] tabular-nums text-foreground-muted">
                    {course.createdAt.toLocaleDateString("en-GB", {
                      day: "numeric",
                      month: "short",
                      year: "numeric",
                    })}
                  </td>
                  <td className="hidden px-3.5 py-2.5 text-[12.5px] text-foreground-muted sm:table-cell">
                    —
                  </td>
                  <td className="px-3.5 py-2.5">
                    <StatusBadge published={course.published} />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
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
      aria-current={active ? "true" : undefined}
      className={cn(
        "grid size-7 place-items-center rounded-chip no-underline transition",
        active
          ? "bg-brand-wash text-brand-strong"
          : "text-foreground-muted hover:text-foreground",
      )}
    >
      {children}
    </Link>
  );
}
