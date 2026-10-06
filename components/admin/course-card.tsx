import Link from "next/link";
import { ChefHat } from "lucide-react";
import type { AdminClassCard } from "@/lib/learn/categories";
import { Badge, cardClass } from "@/components/app/ui";

/**
 * A course in the admin grid, to the supplied design.
 *
 * Cover with its library category as a chip over it (the first shelf it sits
 * on, and how many others), a two-line title, then a footer of three labelled
 * cells divided by hairlines: Creation date, Sales, Status.
 *
 * The Sales cell keeps its place and shows an em dash. The design puts a figure
 * there; this schema has none to give, because money is tracked per membership
 * subscription in SamCart and never per course. An em dash says "nothing to
 * report" — a number would have been invented.
 */
export function CourseCard({ course }: { course: AdminClassCard }) {
  const [home, ...others] = course.categories;
  return (
    <article
      className={cardClass({
        padding: "none",
        interactive: true,
        className: "flex h-full flex-col overflow-hidden",
      })}
    >
      <Link
        href={`/admin/courses/${course.slug}/edit`}
        className="group block no-underline"
      >
        <span className="relative block aspect-16/10 w-full overflow-hidden bg-surface-muted">
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
            <span className="grid size-full place-items-center text-foreground-muted">
              <ChefHat className="size-8" aria-hidden />
            </span>
          )}

          {home ? (
            <Badge
              tone="outline"
              className="absolute left-2.5 top-2.5 max-w-[calc(100%-1.25rem)] truncate border-transparent bg-surface/90 text-foreground shadow-e1 backdrop-blur"
            >
              <span className="truncate">{home.name}</span>
              {others.length > 0 ? (
                <span
                  className="shrink-0 text-foreground-muted"
                  title={others.map((category) => category.name).join(", ")}
                >
                  +{others.length}
                </span>
              ) : null}
            </Badge>
          ) : null}
        </span>

        <h3 className="line-clamp-2 px-4 pb-3 pt-3.5 text-title font-semibold leading-snug text-foreground transition group-hover:text-brand-strong">
          {course.title}
        </h3>
      </Link>

      <dl className="mt-auto grid grid-cols-3 divide-x divide-separator border-t border-separator">
        <Cell label="Creation date">
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
    <div className="min-w-0 px-3 py-2.5 sm:px-4">
      <dt className="text-caption text-foreground-muted">{label}</dt>
      <dd className="mt-0.5 truncate text-label font-medium tabular-nums text-foreground">
        {children}
      </dd>
    </div>
  );
}

/** Published or draft, in the console's one status vocabulary. */
export function StatusBadge({ published }: { published: boolean }) {
  return (
    <Badge tone={published ? "success" : "neutral"}>
      {published ? "Published" : "Draft"}
    </Badge>
  );
}
