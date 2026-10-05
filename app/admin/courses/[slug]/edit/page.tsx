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
import {
  ButtonLink,
  Callout,
  Card,
  CardHeader,
  PageHeader,
} from "@/components/app/ui";
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
 * Two columns: the course's own fields, its curriculum, its shared files and
 * its pricing on the left; the thumbnail and help in the rail. The rail joins
 * at xl rather than lg, because beside it at lg the curriculum rows would have
 * no room for their titles.
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
    <div className="flex flex-col gap-6">
      <PageHeader
        back={{ href: "/admin/courses", label: "Courses" }}
        eyebrow="Edit course"
        title={course.title}
        description={
          <span className="flex flex-wrap items-center gap-x-2.5 gap-y-1">
            <StatusBadge published={course.published} />
            {course.category ? <span>{course.category}</span> : null}
            {course.published ? (
              <Link
                href={classHref(course.slug)}
                className="inline-flex items-center gap-1 font-medium text-link no-underline transition hover:underline"
              >
                View as a member
                <ExternalLink className="size-3.5" aria-hidden />
              </Link>
            ) : null}
          </span>
        }
        actions={
          <PublishButtons
            slug={course.slug}
            published={course.published}
            lessonCount={course.lessonCount}
          />
        }
      />

      <div className="grid grid-cols-1 gap-6 xl:grid-cols-[minmax(0,1fr)_20rem]">
        <div className="flex min-w-0 flex-col gap-6">
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

          <Card padding="none">
            <CardHeader
              title="Course files"
              description="Shown on the class page, beside every lesson. Files that belong to one lesson are attached to that lesson instead."
            />
            <div className="px-4 py-3 sm:px-5">
              <ResourceList
                slug={course.slug}
                resources={course.resources}
                uploadsEnabled={uploadsEnabled}
              />
            </div>
          </Card>

          <Card padding="none">
            <CardHeader title="Pricing plan" />
            <div className="flex flex-col items-start gap-4 px-4 py-4 sm:px-5">
              <p className="text-body text-foreground-muted">
                Membership is what members buy, and SamCart is the source of truth
                for it. A course is included in the membership rather than priced
                on its own, so there is no plan to create here.
              </p>

              {course.pricingProduct ? (
                <p className="text-body text-foreground">
                  Sold through{" "}
                  <span className="font-semibold">{course.pricingProduct.name}</span>
                  {course.pricingProduct.active ? "" : " (inactive)"}.
                </p>
              ) : null}

              <ButtonLink href="/admin/billing">Manage membership billing</ButtonLink>

              <Callout tone="brand" icon={<Lightbulb />} className="w-full text-label">
                Need help pricing your course? Membership pricing lives in{" "}
                <code className="rounded-chip bg-surface px-1 py-0.5 font-mono text-caption">
                  lib/marketing/checkout.ts
                </code>{" "}
                and on the sales page.
              </Callout>
            </div>
          </Card>
        </div>

        <aside className="grid grid-cols-1 content-start gap-4 sm:grid-cols-2 xl:grid-cols-1">
          <CourseThumbnail
            slug={course.slug}
            photo={course.photo}
            hasOwnCover={Boolean(course.coverUrl)}
            maxBytes={IMAGE_MAX_BYTES}
            uploadsEnabled={uploadsEnabled}
          />

          <Card padding="none" className="divide-y divide-separator self-start">
            <HelpBlock
              title="How members find this class"
              body="Published courses appear in the class library and in search, filtered by their category."
              href="/learn"
              cta="See the library"
            />
            <HelpBlock
              title="Edit your sales page"
              body="The public membership page is what sells this catalog to visitors."
              href="/membership"
              cta="See the page"
            />
          </Card>
        </aside>
      </div>
    </div>
  );
}

function HelpBlock({
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
    <div className="flex flex-col items-start gap-1 p-4">
      <h2 className="text-body font-semibold text-foreground">{title}</h2>
      <p className="text-label text-foreground-muted">{body}</p>
      <ButtonLink href={href} size="sm" className="mt-2">
        {cta}
      </ButtonLink>
    </div>
  );
}
