/**
 * Backfill the search index.
 *
 * `upsertSearchIndex` runs when content is created through the app, so anything
 * written directly by a seed script — which is most of the current content — was
 * never indexed. The index held 13 rows against 62 published posts, which made
 * global search and the command palette look broken when they were in fact
 * working perfectly on the three posts they could see.
 *
 * Idempotent: every write is an upsert keyed on (entityType, entityId).
 *
 *   npx tsx prisma/reindex-search.ts
 *
 * Safe against any environment, so it can be run after a production restore or
 * a bulk import, not only locally.
 */
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

/** Trimmed so a long article does not dominate the index row. */
const BODY_LIMIT = 2000;

async function upsert(input: {
  entityType: string;
  entityId: string;
  title: string;
  body: string;
  spaceId?: string | null;
}) {
  const body = input.body.slice(0, BODY_LIMIT);
  await prisma.searchIndex.upsert({
    where: {
      entityType_entityId: {
        entityType: input.entityType,
        entityId: input.entityId,
      },
    },
    update: { title: input.title, body, spaceId: input.spaceId ?? null },
    create: {
      entityType: input.entityType,
      entityId: input.entityId,
      title: input.title,
      body,
      spaceId: input.spaceId ?? null,
    },
  });
}

async function main() {
  let count = 0;

  const posts = await prisma.post.findMany({
    where: { status: "PUBLISHED" },
    select: { id: true, title: true, plainText: true, spaceId: true },
  });
  for (const post of posts) {
    await upsert({
      entityType: "post",
      entityId: post.id,
      title: post.title || post.plainText.slice(0, 80) || "Post",
      body: post.plainText,
      spaceId: post.spaceId,
    });
    count += 1;
  }
  console.log(`posts: ${posts.length}`);

  const comments = await prisma.comment.findMany({
    select: {
      id: true,
      plainText: true,
      post: { select: { title: true, spaceId: true } },
    },
  });
  for (const comment of comments) {
    await upsert({
      entityType: "comment",
      entityId: comment.id,
      // The post's title is the useful label for a comment hit; the comment's
      // own text is the body that gets matched.
      title: comment.post.title || "Comment",
      body: comment.plainText,
      spaceId: comment.post.spaceId,
    });
    count += 1;
  }
  console.log(`comments: ${comments.length}`);

  const members = await prisma.user.findMany({
    where: { deletedAt: null, status: { not: "DELETED" } },
    select: {
      handle: true,
      profile: {
        select: { displayName: true, bio: true, city: true, country: true },
      },
    },
  });
  for (const member of members) {
    await upsert({
      // Members are addressed by handle, which is what /members/[handle] wants.
      entityType: "member",
      entityId: member.handle,
      title: member.profile?.displayName ?? member.handle,
      body: [
        member.handle,
        member.profile?.bio,
        member.profile?.city,
        member.profile?.country,
      ]
        .filter(Boolean)
        .join(" "),
    });
    count += 1;
  }
  console.log(`members: ${members.length}`);

  const courses = await prisma.course.findMany({
    select: { slug: true, title: true, description: true, spaceId: true },
  });
  for (const course of courses) {
    await upsert({
      entityType: "course",
      entityId: course.slug,
      title: course.title,
      body: course.description ?? "",
      spaceId: course.spaceId,
    });
    count += 1;
  }
  console.log(`courses: ${courses.length}`);

  const lessons = await prisma.lesson.findMany({
    select: { id: true, title: true, body: true },
  });
  for (const lesson of lessons) {
    await upsert({
      entityType: "lesson",
      entityId: lesson.id,
      title: lesson.title,
      body: lesson.body ?? "",
    });
    count += 1;
  }
  console.log(`lessons: ${lessons.length}`);

  const events = await prisma.event.findMany({
    select: { id: true, title: true, description: true, spaceId: true },
  });
  for (const event of events) {
    await upsert({
      entityType: "event",
      entityId: event.id,
      title: event.title,
      body: event.description ?? "",
      spaceId: event.spaceId,
    });
    count += 1;
  }
  console.log(`events: ${events.length}`);

  const total = await prisma.searchIndex.count();
  console.log(`\nindexed ${count} rows; SearchIndex now holds ${total}`);
}

main()
  .then(() => prisma.$disconnect())
  .catch(async (error) => {
    console.error(error);
    await prisma.$disconnect();
    process.exit(1);
  });
