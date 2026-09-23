import { PrismaClient } from "@prisma/client";
import { seedCommunity, seedEngagement, seedPosts } from "./seed-community";

const prisma = new PrismaClient();

/**
 * Replace the member and post data, and nothing else.
 *
 * Run with `pnpm db:reseed`. It is deliberately narrow about what it removes,
 * because this script points at whatever DATABASE_URL points at:
 *
 * **Kept:** courses, spaces, space groups, billing products, entitlements,
 * SamCart mappings, and the admin account itself.
 *
 * **Removed:** posts and everything hanging off them, comments, reactions,
 * votes, bookmarks, follows, conversations and messages, notifications, and the
 * member profiles that are not the administrator.
 *
 * The administrator is upserted rather than deleted. Its address is a `.test`
 * domain that cannot receive a magic link, so dropping the row would lock the
 * only administrator out with no way back in.
 */

const ADMIN_EMAIL = "adam@veganuniversity.test";

async function wipe() {
  const admin = await prisma.user.findUnique({
    where: { email: ADMIN_EMAIL },
    select: { id: true },
  });

  // Order matters where a relation is not cascading; children first.
  await prisma.reaction.deleteMany({});
  await prisma.vote.deleteMany({});
  await prisma.bookmark.deleteMany({});
  await prisma.pollVote.deleteMany({});
  await prisma.pollOption.deleteMany({});
  await prisma.commentMention.deleteMany({});
  await prisma.postMention.deleteMany({});
  await prisma.report.deleteMany({});
  await prisma.comment.deleteMany({});
  await prisma.postAttachment.deleteMany({});
  await prisma.post.deleteMany({});

  await prisma.follow.deleteMany({});
  await prisma.notification.deleteMany({});
  await prisma.message.deleteMany({});
  await prisma.conversationMember.deleteMany({});
  await prisma.conversation.deleteMany({});
  await prisma.welcomeMessageJob.deleteMany({});
  await prisma.memberMatch.deleteMany({});
  await prisma.cohortMember.deleteMany({});
  await prisma.memberBadge.deleteMany({});
  await prisma.userBlock.deleteMany({});

  // Posts are gone, so their index rows are stale.
  await prisma.searchIndex.deleteMany({
    where: { entityType: { in: ["post", "comment", "member"] } },
  });

  // Members, except the administrator. Entitlements and subscriptions belong
  // to billing rather than to seed data, so anyone holding one stays.
  const removable = await prisma.user.findMany({
    where: {
      id: admin ? { not: admin.id } : undefined,
      subscriptions: { none: {} },
      email: { endsWith: "@veganuniversity.test" },
    },
    select: { id: true, email: true },
  });
  await prisma.entitlement.deleteMany({
    where: { userId: { in: removable.map((user) => user.id) } },
  });
  await prisma.user.deleteMany({
    where: { id: { in: removable.map((user) => user.id) } },
  });

  return { removedUsers: removable.length, keptAdmin: Boolean(admin) };
}

async function main() {
  const url = process.env.DATABASE_URL ?? "";
  const host = url.replace(/^.*@/, "").replace(/\/.*$/, "");
  console.log(`Reseeding the community on ${host}`);

  const before = {
    users: await prisma.user.count(),
    posts: await prisma.post.count(),
    courses: await prisma.course.count(),
  };
  console.log("before:", before);

  const wiped = await wipe();
  console.log("wiped:", wiped);

  const ctx = await seedCommunity(prisma);
  console.log(`people: ${ctx.people.length}`);

  const posts = await seedPosts(prisma, ctx);
  console.log(`posts: ${posts.length}`);

  await seedEngagement(prisma, ctx, posts);

  const after = {
    users: await prisma.user.count(),
    posts: await prisma.post.count(),
    comments: await prisma.comment.count(),
    reactions: await prisma.reaction.count(),
    bookmarks: await prisma.bookmark.count(),
    votes: await prisma.vote.count(),
    follows: await prisma.follow.count(),
    courses: await prisma.course.count(),
  };
  console.log("after:", after);

  if (after.courses !== before.courses) {
    throw new Error(
      `Class catalog changed: ${before.courses} -> ${after.courses}. It must not.`,
    );
  }
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
