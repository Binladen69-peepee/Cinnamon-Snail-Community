import { getPublishedCoursePreview } from "@/lib/marketing/stats";
import { EmptyState } from "@/components/ui/empty-state";
import { ButtonLink } from "@/components/ui/button";

export default async function CoursesMarketingPage() {
  const courses = await getPublishedCoursePreview();
  return (
    <article className="vu-gutter mx-auto max-w-3xl py-16">
      <p className="text-sm uppercase tracking-[0.18em] text-olive">Courses</p>
      <h1 className="mt-3 font-display text-5xl text-forest">
        Cooking school energy. No intimidating LMS.
      </h1>
      <p className="mt-6 text-lg text-muted">
        Lessons are short, visual, and tied to real plates. You will always see
        what to cook next, how long it takes, and where the community is talking
        about the same recipe.
      </p>
      {courses.length === 0 ? (
        <div className="mt-10">
          <EmptyState
            title="Catalog is empty on this environment"
            body="Published courses appear here from the database. Sign in to play lessons when you have an active entitlement."
          />
        </div>
      ) : (
        <ul className="mt-10 space-y-4">
          {courses.map((course) => (
            <li key={course.slug} className="vu-card p-5">
              <h2 className="font-display text-2xl text-forest">{course.title}</h2>
              {course.description ? (
                <p className="mt-2 text-foreground-muted">{course.description}</p>
              ) : null}
              <ButtonLink href={`/learn/${course.slug}`} className="mt-4" size="sm">
                View inside campus
              </ButtonLink>
            </li>
          ))}
        </ul>
      )}
    </article>
  );
}
