import Link from "next/link";
import { ChefHat } from "lucide-react";
import type { AdminCourse } from "@/lib/admin/courses";
import { cn } from "@/lib/utils";

/**
 * A course in the admin grid, to the supplied design.
 *
 * Cover with the category as a chip over it, a two-line title, then a footer of
 * three labelled cells divided by hairlines: Creation Date, Sales, Status.
 *
 * The Sales cell keeps its place and shows an em dash. The design puts a figure
 * there; this schema has none to give, because money is tracked per membership
 * subscription in SamCart and never per course. An em dash says "nothing to
 * report" — a number would have been invented.
 */
export function CourseCard({ course }: { course: AdminCourse }) {
  return (
    <article className="flex h-full flex-col overflow-hidden rounded-card border border-border bg-surface transition hover:border-hairline-firm hover:shadow-e2">
      <Link
        href={`/admin/courses/${course.slug}/edit`}
        className="group block no-underline"
      >
        <span className="relative block aspect-[16/10] w-full overflow-hidden bg-brand-wash">
          {course.photo ? (
            // Class stills come from the client's own media host.
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={course.photo}
              alt=""
              loading="lazy"
              decoding="async"
              className="size-full object-cover transition duration-300 group-hover:scale-[1.03]"
            />
          ) : (
            <span className="grid size-full place-items-center text-brand-strong/40">
              <ChefHat className="size-8" aria-hidden />
            </span>
          )}

          {course.category ? (
            <span className="absolute left-2.5 top-2.5 rounded-chip bg-surface/90 px-2 py-0.5 text-[11px] font-bold text-foreground backdrop-blur">
              {course.category}
            </span>
          ) : null}
        </span>

        <h3 className="line-clamp-2 px-3.5 pb-3 pt-3 text-[15px] font-bold leading-snug text-foreground">
          {course.title}
        </h3>
      </Link>

      <dl className="mt-auto grid grid-cols-3 divide-x divide-border border-t border-border">
        <Cell label="Creation Date">
          <time dateTime={course.createdAt.toISOString()}>
            {course.createdAt.toLocaleDateString("en-GB", {
              day: "numeric",
              month: "short",
              year: "numeric",
            })}
          </time>
        </Cell>
        <Cell label="Sales">
          <span title="Sales are tracked per membership in SamCart, not per course">
            &mdash;
          </span>
        </Cell>
        <Cell label="Status">
          <StatusBadge published={course.published} />
        </Cell>
      </dl>
    </article>
  );
}

function Cell({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div className="px-3 py-2.5">
      <dt className="text-[10.5px] font-semibold text-foreground-muted">
        {label}
      </dt>
      <dd className="mt-1 truncate text-[12px] font-bold text-foreground">
        {children}
      </dd>
    </div>
  );
}

export function StatusBadge({ published }: { published: boolean }) {
  return (
    <span
      className={cn(
        "inline-flex items-center rounded-chip px-2 py-0.5 text-[11px] font-bold",
        published
          ? "bg-brand text-on-brand"
          : "bg-default text-foreground-muted",
      )}
    >
      {published ? "Published" : "Unpublished"}
    </span>
  );
}
