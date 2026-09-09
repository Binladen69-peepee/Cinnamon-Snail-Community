import Image from "next/image";
import Link from "next/link";
import { ButtonLink } from "@/components/ui/button";
import { FaqAccordion } from "@/components/marketing/faq-accordion";
import {
  MEMBER_STORIES,
  PILLARS,
  REPRESENTATIVE_COURSES,
} from "@/lib/marketing/homepage";
import {
  getHomepageMomentum,
  getPublishedCoursePreview,
} from "@/lib/marketing/stats";

export const revalidate = 60;

export default async function HomePage() {
  const [momentum, liveCourses] = await Promise.all([
    getHomepageMomentum(),
    getPublishedCoursePreview(),
  ]);

  const courses =
    liveCourses.length > 0
      ? liveCourses.map((course) => ({
          href: `/courses/${course.slug}`,
          title: course.title,
          level: course.instructorName ? `With ${course.instructorName}` : "Course",
          description: course.description ?? "A cooking-school lesson that ends in a plate.",
          image:
            course.coverUrl ??
            "https://images.unsplash.com/photo-1512621776951-a57141f2eefd?auto=format&fit=crop&w=900&q=80",
          alt: course.title,
          placeholder: false,
        }))
      : REPRESENTATIVE_COURSES.map((course) => ({
          href: "/courses",
          title: course.title,
          level: course.level,
          description: course.description,
          image: course.image,
          alt: course.alt,
          placeholder: true,
        }));

  return (
    <div className="pb-8">
      <section className="vu-gutter py-12 md:py-20">
        <div className="vu-shell grid items-center gap-10 lg:grid-cols-2">
          <div className="hero-copy-reveal">
            <p className="text-sm font-bold uppercase tracking-[0.2em] text-accent">
              A cooking school with a kitchen table
            </p>
            <h1 className="mt-4 text-4xl leading-[1.1] font-extrabold tracking-tight text-foreground md:text-6xl">
              Learn to cook plants like you already{" "}
              <span className="text-accent">belong</span> here.
            </h1>
            <p className="prose-measure mt-6 text-lg leading-relaxed font-normal text-foreground-muted">
              Courses that end in dinner, recipes you actually make, and a hosted
              table for the sauce question you were going to Google at 9pm.
            </p>
            <div className="mt-8 flex flex-wrap gap-3">
              <ButtonLink href="/membership" size="lg">
                Become a member
              </ButtonLink>
              <ButtonLink href="/community" variant="secondary" size="lg">
                Peek at the community
              </ButtonLink>
            </div>
          </div>
          <div className="hero-copy-reveal relative mx-auto aspect-square w-full max-w-lg overflow-hidden rounded-[2rem] shadow-[0_16px_40px_rgba(26,26,26,0.08)]">
            <Image
              src="https://images.unsplash.com/photo-1540420773420-3366772f4999?auto=format&fit=crop&w=1400&q=80"
              alt="A vibrant bowl of roasted vegetables, greens, and citrus"
              fill
              priority
              className="object-cover"
            />
          </div>
        </div>
      </section>

      <section aria-label="Campus snapshot" className="vu-gutter pb-8">
        <div className="vu-card vu-shell grid grid-cols-2 gap-8 px-6 py-10 text-center md:grid-cols-4 md:px-10">
          {momentum.map((stat) => (
            <div key={stat.label}>
              <p className="text-4xl font-extrabold tracking-tight text-accent md:text-5xl">
                {stat.value}
              </p>
              <p className="mt-2 text-sm font-medium text-foreground">{stat.label}</p>
              {stat.placeholder ? (
                <p className="mt-1 text-xs font-normal text-foreground-muted">
                  Placeholder — ratings arrive with the course catalog.
                </p>
              ) : null}
            </div>
          ))}
        </div>
      </section>

      <section className="vu-gutter py-16">
        <div className="vu-shell">
          <p className="text-sm font-bold uppercase tracking-[0.2em] text-accent">
            What you get
          </p>
          <h2 className="mt-3 max-w-[18ch] text-4xl font-extrabold tracking-tight md:text-5xl">
            Learn. Cook. <span className="text-accent">Belong.</span>
          </h2>
          <div className="mt-10 grid gap-6 md:grid-cols-3">
            {PILLARS.map((pillar) => (
              <article key={pillar.title} className="vu-card overflow-hidden p-4">
                <div className="relative aspect-[4/3] overflow-hidden rounded-[1.25rem]">
                  <Image
                    src={pillar.image}
                    alt={pillar.alt}
                    fill
                    className="object-cover"
                  />
                </div>
                <h3 className="mt-5 px-2 text-2xl font-extrabold tracking-tight">
                  {pillar.title}
                </h3>
                <p className="mt-2 px-2 pb-3 text-sm leading-relaxed text-foreground-muted">
                  {pillar.body}
                </p>
              </article>
            ))}
          </div>
        </div>
      </section>

      <section className="vu-gutter py-8">
        <div className="vu-card vu-shell grid overflow-hidden lg:grid-cols-2">
          <div className="relative min-h-[22rem]">
            <Image
              src="https://images.unsplash.com/photo-1414235077428-338989a2e8c0?auto=format&fit=crop&w=1400&q=80"
              alt="A shared table of plated food — the kitchen table, not a dashboard"
              fill
              sizes="(min-width: 1024px) 50vw, 100vw"
              className="object-cover"
            />
          </div>
          <div className="flex flex-col justify-center px-8 py-12 lg:px-12">
            <p className="text-sm font-bold uppercase tracking-[0.2em] text-accent">
              The differentiator
            </p>
            <h2 className="mt-3 text-3xl font-extrabold tracking-tight md:text-4xl">
              Kitchen Table is not a feed. It is the{" "}
              <span className="text-accent">table</span>.
            </h2>
            <p className="prose-measure mt-5 leading-relaxed text-foreground-muted">
              Other platforms rent you a generic community module. Kitchen Table
              is Vegan University&apos;s own room: hosted, named, and tied to
              what you cooked. You follow a lesson, make dinner, post the plate,
              and find someone wrestling the same radicchio.
            </p>
            <p className="prose-measure mt-4 leading-relaxed text-foreground-muted">
              There is no engagement algorithm deciding who gets seen. Hosts keep
              the conversation edible. Members have cities and favorite pans —
              not anonymous handles in a content library.
            </p>
            <div className="mt-8">
              <ButtonLink href="/community">Peek at the community</ButtonLink>
            </div>
          </div>
        </div>
      </section>

      <section className="vu-gutter py-16">
        <div className="vu-shell">
          <div className="flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
            <div>
              <p className="text-sm font-bold uppercase tracking-[0.2em] text-accent">
                Courses
              </p>
              <h2 className="mt-3 text-4xl font-extrabold tracking-tight">
                Cooking school energy. No{" "}
                <span className="text-accent">LMS</span> maze.
              </h2>
            </div>
            <ButtonLink href="/courses" variant="secondary">
              See the catalog
            </ButtonLink>
          </div>
          {liveCourses.length === 0 ? (
            <p className="mt-4 text-sm text-foreground-muted">
              Representative upcoming classes — the live catalog ships with course
              playback (Phase 3). These are not fake enrolled listings.
            </p>
          ) : null}
          <div className="mt-10 grid gap-6 sm:grid-cols-2 lg:grid-cols-4">
            {courses.map((course) => (
              <Link
                key={course.title}
                href={course.href}
                className="vu-card group block overflow-hidden p-3"
              >
                <div className="relative aspect-[4/3] overflow-hidden rounded-[1.25rem]">
                  <Image
                    src={course.image}
                    alt={course.alt}
                    fill
                    className="object-cover"
                  />
                </div>
                <div className="px-2 pt-4 pb-3">
                  <span className="inline-flex rounded-full bg-accent px-3 py-1 text-[11px] font-bold uppercase tracking-wider text-white">
                    {course.level}
                  </span>
                  <h3 className="mt-3 text-lg font-extrabold tracking-tight group-hover:text-accent">
                    {course.title}
                  </h3>
                  <p className="mt-2 text-sm leading-relaxed text-foreground-muted">
                    {course.description}
                  </p>
                </div>
              </Link>
            ))}
          </div>
        </div>
      </section>

      <section className="vu-gutter py-8">
        <div className="vu-shell">
          <p className="text-sm font-bold uppercase tracking-[0.2em] text-accent">
            Member stories
          </p>
          <h2 className="mt-3 max-w-[16ch] text-4xl font-extrabold tracking-tight">
            In their own kitchen <span className="text-accent">voice</span>.
          </h2>
          <p className="mt-3 max-w-xl text-sm text-foreground-muted">
            Composite portraits from the kinds of journeys Kitchen Table is for —
            not attributed quotes from live member profiles.
          </p>
          <div className="mt-10 grid gap-6 lg:grid-cols-3">
            {MEMBER_STORIES.map((story, index) => (
              <figure
                key={story.name}
                className={
                  index === 0
                    ? "rounded-[1.5rem] bg-accent p-6 text-white shadow-[0_10px_40px_rgba(26,26,26,0.08)]"
                    : "vu-card p-6"
                }
              >
                <div className="relative aspect-[5/4] overflow-hidden rounded-[1.25rem]">
                  <Image
                    src={story.image}
                    alt={story.alt}
                    fill
                    className="object-cover"
                  />
                </div>
                <blockquote
                  className={
                    index === 0
                      ? "mt-5 text-xl font-bold leading-snug"
                      : "mt-5 text-xl font-bold leading-snug text-foreground"
                  }
                >
                  “{story.quote}”
                </blockquote>
                <figcaption
                  className={
                    index === 0
                      ? "mt-4 text-sm text-white/85"
                      : "mt-4 text-sm text-foreground-muted"
                  }
                >
                  <span className="font-bold">{story.name}</span>
                  <span className="block font-normal">{story.detail}</span>
                </figcaption>
              </figure>
            ))}
          </div>
        </div>
      </section>

      <section className="vu-gutter py-16">
        <div className="vu-card vu-shell grid items-center overflow-hidden lg:grid-cols-2">
          <div className="px-8 py-12 lg:px-12">
            <p className="text-sm font-bold uppercase tracking-[0.2em] text-accent">
              Membership
            </p>
            <h2 className="mt-3 text-3xl font-extrabold tracking-tight md:text-4xl">
              A seat at the table, billed without{" "}
              <span className="text-accent">tricks</span>.
            </h2>
            <p className="prose-measure mt-5 leading-relaxed text-foreground-muted">
              Membership unlocks Kitchen Table, the course catalog as it ships,
              events, and a cooking roadmap. Price lives on SamCart checkout — we
              do not invent a number here because SamCart is the source of truth
              for money.
            </p>
            <ul className="mt-6 max-w-md space-y-3 text-foreground">
              <li>Learn at a human pace, with lessons that lead to dinner.</li>
              <li>Cook with people in the same season, not a content drip.</li>
              <li>
                Cancel in the open from Membership after you sign in. Access
                follows the period SamCart reports.
              </li>
            </ul>
            <div className="mt-8">
              <ButtonLink href="/membership" size="lg">
                Become a member
              </ButtonLink>
            </div>
          </div>
          <div className="relative min-h-[22rem] p-4">
            <div className="relative h-full min-h-[20rem] overflow-hidden rounded-[1.25rem]">
              <Image
                src="https://images.unsplash.com/photo-1507048331197-7d4ac70811cf?auto=format&fit=crop&w=1400&q=80"
                alt="Hands preparing vegetables — membership is the school plus the table"
                fill
                className="object-cover"
              />
            </div>
          </div>
        </div>
      </section>

      <section className="vu-gutter pb-16">
        <div className="vu-card mx-auto max-w-3xl px-8 py-12">
          <p className="text-sm font-bold uppercase tracking-[0.2em] text-accent">
            FAQ
          </p>
          <h2 className="mt-3 text-3xl font-extrabold tracking-tight md:text-4xl">
            Questions, answered <span className="text-accent">plainly</span>
          </h2>
          <div className="mt-6">
            <FaqAccordion />
          </div>
        </div>
      </section>
    </div>
  );
}
