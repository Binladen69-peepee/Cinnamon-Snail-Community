import type { PrismaClient } from "@prisma/client";
import { renderMarkdown, toPlainText } from "../lib/markdown";
import { lessonDiscussionKey } from "../lib/learn/catalog";

const DEMO_VIDEO = "https://interactive-examples.mdn.mozilla.net/media/cc0-videos/flower.mp4";

export async function seedCampusLearning(prisma: PrismaClient, adamId: string) {
  const hall = await prisma.space.findUnique({ where: { slug: "course-hall" } });
  const porch = await prisma.space.findUnique({ where: { slug: "calendar-porch" } });
  if (!hall) return;

  const course = await prisma.course.upsert({
    where: { slug: "weeknight-plants" },
    update: {
      published: true,
      title: "Weeknight plants",
      description:
        "Dinner in under 40 minutes from a normal grocery run. Lessons end in a plate, not a quiz wall.",
      instructorName: "Adam",
      coverUrl:
        "https://images.unsplash.com/photo-1512621776951-a57141f2eefd?auto=format&fit=crop&w=1400&q=80",
      spaceId: hall.id,
    },
    create: {
      slug: "weeknight-plants",
      published: true,
      title: "Weeknight plants",
      description:
        "Dinner in under 40 minutes from a normal grocery run. Lessons end in a plate, not a quiz wall.",
      instructorName: "Adam",
      coverUrl:
        "https://images.unsplash.com/photo-1512621776951-a57141f2eefd?auto=format&fit=crop&w=1400&q=80",
      spaceId: hall.id,
    },
  });

  const fridge =
    (await prisma.courseSection.findFirst({
      where: { courseId: course.id, title: "Start with what's in the fridge" },
    })) ??
    (await prisma.courseSection.create({
      data: { courseId: course.id, title: "Start with what's in the fridge", sortOrder: 0 },
    }));
  const sauce =
    (await prisma.courseSection.findFirst({
      where: { courseId: course.id, title: "A sauce that carries the plate" },
    })) ??
    (await prisma.courseSection.create({
      data: { courseId: course.id, title: "A sauce that carries the plate", sortOrder: 1 },
    }));

  const lessons = [
    {
      sectionId: fridge.id,
      slug: "welcome",
      title: "Welcome — dinner is the homework",
      kind: "text",
      durationMin: 4,
      sortOrder: 0,
      body: "This campus is a cooking school that still looks like a kitchen. Watch, cook the same night, then post the plate in Course Hall. Mighty course files are not imported here (DEC-003). This is original Vegan University material.",
    },
    {
      sectionId: fridge.id,
      slug: "the-20-minute-pan",
      title: "The 20-minute pan",
      kind: "video",
      durationMin: 12,
      sortOrder: 1,
      videoUid: DEMO_VIDEO,
      captions: "/images/learn/weeknight-pan.vtt",
      body: "Chapters: heat the pan, then salt before sauce.\n\nPlayback is entitlement-gated and uses an expiring app token. Until Cloudflare Stream keys exist, this lesson uses a short public demo clip so resume, captions, and completion can be verified (DEC-014). Do not treat that clip as a Mighty import.",
    },
    {
      sectionId: fridge.id,
      slug: "salt-the-tofu-first",
      title: "Salt the tofu first",
      kind: "text",
      durationMin: 6,
      sortOrder: 2,
      body: "Press if you have time. Salt while the pan heats. The sauce only tastes loud if the tofu is seasoned before it browns.",
    },
    {
      sectionId: sauce.id,
      slug: "a-sauce-you-can-taste",
      title: "A sauce you can taste",
      kind: "video",
      durationMin: 10,
      sortOrder: 0,
      videoUid: DEMO_VIDEO,
      captions: "/images/learn/weeknight-pan.vtt",
      body: "Chili oil, citrus, and something salty. Taste from a spoon, then from the tofu, then decide if it needs more acid.",
    },
    {
      sectionId: sauce.id,
      slug: "what-did-you-cook",
      title: "Reflection: what did you cook?",
      kind: "reflection",
      durationMin: 5,
      sortOrder: 1,
      body: "Write it in the lesson thread: what was in the fridge, what sauce carried it, and whether you would make it again on a Tuesday.",
    },
  ];

  for (const spec of lessons) {
    const existing = await prisma.lesson.findFirst({
      where: { sectionId: spec.sectionId, slug: spec.slug },
    });
    const lesson = existing
      ? await prisma.lesson.update({
          where: { id: existing.id },
          data: {
            title: spec.title,
            kind: spec.kind,
            body: spec.body,
            durationMin: spec.durationMin,
            videoUid: "videoUid" in spec ? spec.videoUid : null,
            sortOrder: spec.sortOrder,
          },
        })
      : await prisma.lesson.create({
          data: {
            sectionId: spec.sectionId,
            title: spec.title,
            slug: spec.slug,
            kind: spec.kind,
            body: spec.body,
            durationMin: spec.durationMin,
            videoUid: "videoUid" in spec ? spec.videoUid : null,
            sortOrder: spec.sortOrder,
          },
        });

    if ("captions" in spec && spec.captions) {
      const already = await prisma.resource.findFirst({
        where: { lessonId: lesson.id, kind: "captions" },
      });
      if (!already) {
        await prisma.resource.create({
          data: {
            lessonId: lesson.id,
            title: "English captions",
            url: spec.captions,
            kind: "captions",
          },
        });
      }
    }

    const threadBody = `Discussion for **${spec.title}**. Ask the sauce question here.`;
    const key = lessonDiscussionKey(lesson.id);
    const existingThread = await prisma.post.findFirst({ where: { linkUrl: key } });
    if (!existingThread) {
      await prisma.post.create({
        data: {
          spaceId: hall.id,
          authorId: adamId,
          type: "QUESTION",
          status: "PUBLISHED",
          title: spec.title,
          body: threadBody,
          bodyHtml: renderMarkdown(threadBody),
          plainText: toPlainText(threadBody),
          publishedAt: new Date(),
          linkUrl: key,
        },
      });
    }
  }

  const grocery = await prisma.resource.findFirst({
    where: { courseId: course.id, title: "Tuesday grocery list" },
  });
  if (!grocery) {
    await prisma.resource.create({
      data: {
        courseId: course.id,
        title: "Tuesday grocery list",
        url: "/images/learn/weeknight-grocery.txt",
        kind: "file",
      },
    });
  }

  await prisma.searchIndex.upsert({
    where: { entityType_entityId: { entityType: "course", entityId: course.id } },
    update: { title: course.title, body: course.description ?? "", spaceId: hall.id },
    create: {
      entityType: "course",
      entityId: course.id,
      title: course.title,
      body: course.description ?? "",
      spaceId: hall.id,
    },
  });

  if (porch) {
    const startsAt = new Date();
    startsAt.setDate(startsAt.getDate() + 7);
    startsAt.setHours(18, 0, 0, 0);
    const existingEvent = await prisma.event.findFirst({
      where: { title: "Weeknight plants live cook" },
    });
    if (!existingEvent) {
      await prisma.event.create({
        data: {
          spaceId: porch.id,
          title: "Weeknight plants live cook",
          description:
            "Cook the 20-minute pan together. Bring whatever is in your fridge. Zoom is added when a real session exists — we do not invent a meeting link.",
          startsAt,
          endsAt: new Date(startsAt.getTime() + 90 * 60 * 1000),
          timezone: "America/Los_Angeles",
          location: "Kitchen Table (online)",
          capacity: 24,
        },
      });
    }
  }
}
