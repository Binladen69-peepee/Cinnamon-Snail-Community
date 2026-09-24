import Link from "next/link";
import { notFound } from "next/navigation";
import { ExternalLink, Lightbulb } from "lucide-react";
import { courseCategories, getAdminCourse } from "@/lib/admin/courses";
import { CourseDetailsForm } from "@/components/admin/course-details-form";
import { CourseThumbnail } from "@/components/admin/course-thumbnail";
import { CurriculumEditor } from "@/components/admin/curriculum-editor";
import { PublishButtons } from "@/components/admin/publish-button";
import { ResourceList } from "@/components/admin/resource-list";
import { StatusBadge } from "@/components/admin/course-card";
import { IMAGE_MAX_BYTES } from "@/lib/uploads/policy";
import { uploadsConfigured } from "@/lib/uploads/storage";
import { classHref } from "@/lib/learn/classes";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const course = await getAdminCourse(slug);
  return { title: course ? `Edit · ${course.title}` : "Edit course" };
}

/**
 * The course editor.
 *
 * Two columns: the course's own fields, its curriculum and its shared files on
 * the left; the thumbnail, pricing and help in the rail.
 *
 * Pricing is the one panel that still describes rather than edits. Money is
 * SamCart's — DEC-001 makes it the source of truth — so the panel points there
 * instead of offering to create a plan this app could not honour.
 */
export default async function EditCoursePage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const [course, categories] = await Promise.all([
    getAdminCourse(slug),
    courseCategories(),
  ]);
  if (!course) notFound();

  const uploadsEnabled = uploadsConfigured();

  return (
    <div className="space-y-4">
      <nav aria-label="Breadcrumb" className="text-[12.5px] text-foreground-muted">
        <Link
          href="/admin/courses"
          className="font-semibold text-foreground-muted no-underline hover:text-foreground hover:underline"
        >
          Courses
        </Link>
        <span aria-hidden> / </span>
        <span>Edit</span>
      </nav>

      <header className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <h1 className="font-display text-[1.5rem] font-bold leading-tight tracking-[-0.02em] text-foreground">
            {course.title}
          </h1>
          <p className="mt-1.5 flex flex-wrap items-center gap-2 text-[12.5px] text-foreground-muted">
            <StatusBadge published={course.published} />
            {course.category ? <span>{course.category}</span> : null}
            {course.published ? (
              <Link
                href={classHref(course.slug)}
                className="inline-flex items-center gap-1 font-semibold text-brand no-underline hover:underline"
              >
                View as a member
                <ExternalLink className="size-3" aria-hidden />
              </Link>
            ) : null}
          </p>
        </div>

        <PublishButtons
          slug={course.slug}
          published={course.published}
          lessonCount={course.lessonCount}
        />
      </header>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-[minmax(0,1fr)_300px]">
        <div className="space-y-4">
          <CourseDetailsForm
            slug={course.slug}
            course={course}
            categories={categories}
            spaces={course.spaces}
          />

          <CurriculumEditor
            slug={course.slug}
            sections={course.sections}
            uploadsEnabled={uploadsEnabled}
          />

          <section className="rounded-card border border-border bg-surface">
            <div className="border-b border-border px-4 py-3">
              <h2 className="text-[14px] font-bold text-foreground">
                Course files
              </h2>
              <p className="mt-0.5 text-[12.5px] text-foreground-muted">
                Shown on the class page, beside every lesson. Files that belong
                to one lesson are attached to that lesson instead.
              </p>
            </div>
            <div className="px-4 py-3.5">
              <ResourceList
                slug={course.slug}
                resources={course.resources}
                uploadsEnabled={uploadsEnabled}
              />
            </div>
          </section>

          <section className="rounded-card border border-border bg-surface p-4">
            <h2 className="text-[14px] font-bold text-foreground">Pricing Plan</h2>
            <p className="mt-1 text-[13px] leading-relaxed text-foreground-muted">
              Membership is what members buy, and SamCart is the source of truth
              for it. A course is included in the membership rather than priced
              on its own, so there is no plan to create here.
            </p>

            {course.pricingProduct ? (
              <p className="mt-2.5 text-[13px] text-foreground">
                Sold through{" "}
                <span className="font-bold">{course.pricingProduct.name}</span>
                {course.pricingProduct.active ? "" : " (inactive)"}.
              </p>
            ) : null}

            <Link
              href="/admin/billing"
              className="mt-3 inline-flex h-9 items-center gap-1.5 rounded-ctl border border-border bg-background px-4 text-[13px] font-semibold text-foreground no-underline transition hover:border-hairline-firm"
            >
              Manage membership billing
            </Link>

            <p className="mt-3 flex items-start gap-2 rounded-ctl bg-brand-wash px-3 py-2.5 text-[12.5px] leading-snug text-brand-strong">
              <Lightbulb className="mt-px size-3.5 shrink-0" aria-hidden />
              <span>
                Need help pricing your course? Membership pricing lives in{" "}
                <code className="font-mono text-[11.5px]">
                  lib/marketing/checkout.ts
                </code>{" "}
                and on the sales page.
              </span>
            </p>
          </section>
        </div>

        <aside className="space-y-3">
          <CourseThumbnail
            slug={course.slug}
            photo={course.photo}
            hasOwnCover={Boolean(course.coverUrl)}
            maxBytes={IMAGE_MAX_BYTES}
            uploadsEnabled={uploadsEnabled}
          />

          <HelpCard
            title="How members find this class"
            body="Published courses appear in the class library and in Discover, filtered by their category."
            href="/learn"
            cta="See the library"
          />

          <HelpCard
            title="Edit your sales page"
            body="The public membership page is what sells this catalog to visitors."
            href="/membership"
            cta="See the page"
          />
        </aside>
      </div>
    </div>
  );
}

function HelpCard({
  title,
  body,
  href,
  cta,
}: {
  title: string;
  body: string;
  href: string;
  cta: string;
}) {
  return (
    <section className="rounded-card border border-border bg-surface p-3.5">
      <h2 className="text-[13.5px] font-bold text-foreground">{title}</h2>
      <p className="mt-1 text-[12.5px] leading-snug text-foreground-muted">
        {body}
      </p>
      <Link
        href={href}
        className="mt-2.5 inline-flex h-8 items-center rounded-ctl border border-border bg-background px-3 text-[12.5px] font-semibold text-foreground no-underline transition hover:border-hairline-firm"
      >
        {cta}
      </Link>
    </section>
  );
}
