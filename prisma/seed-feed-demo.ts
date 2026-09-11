/**
 * Development-only demo content for the /home feed.
 *
 * The feed had 62 posts but no scores, no reaction counts, two threaded
 * replies, and its only images were Unsplash stock — which the photography
 * rule for this project forbids. None of that exercises a vote rail, an
 * engagement row, a multi-image grid or a comment thread, so the redesign could
 * not actually be seen.
 *
 * This fills those in using Adam's own photographs from the Cinnamon Snail
 * media library, with their real pixel dimensions and their real alt text, so
 * the feed reserves the correct space before an image loads.
 *
 * Idempotent: every write is an upsert or is preceded by a delete of what it
 * replaces, so running it twice changes nothing.
 *
 *   npx tsx prisma/seed-feed-demo.ts
 *
 * Refuses to run against a non-local database.
 */
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

const WP = "https://cinnamonsnail.com/wp-content/uploads";

/** Real photographs, with the dimensions the media library reports. */
const DISHES = [
  {
    url: `${WP}/2026/09/butternut_squash_hummus-2.jpg`,
    width: 1200,
    height: 1800,
    alt: "A bowl of butternut squash hummus topped with pumpkin seeds and parsley",
  },
  {
    url: `${WP}/2026/08/truffle_cauliflower_soup-1.jpg`,
    width: 1200,
    height: 1800,
    alt: "A bowl of creamy truffled cauliflower white bean soup",
  },
  {
    url: `${WP}/2026/08/acorn_squash_soup.jpg`,
    width: 1200,
    height: 1800,
    alt: "A bowl of acorn squash soup topped with pomegranate seeds and sage",
  },
  {
    url: `${WP}/2026/08/Beastmode-Burger-3.jpg`,
    width: 960,
    height: 922,
    alt: "A close-up of a bitten burger with barbecue sauce and macaroni cheese",
  },
  {
    url: `${WP}/2026/09/vegan_pumpkin_cornbread-2.jpg`,
    width: 1200,
    height: 1800,
    alt: "A hand holds a thick square of pumpkin cornbread topped with whipped cream",
  },
  {
    url: `${WP}/2026/09/roasted_pumpkin_salad-3.jpg`,
    width: 1200,
    height: 1800,
    alt: "A colourful salad with mixed greens, roasted squash and candied nuts",
  },
  {
    url: `${WP}/2026/09/roasted_pumpkin_salad-4.jpg`,
    width: 1200,
    height: 1800,
    alt: "A hand holds a plate of salad with leafy greens and roasted sweet potato",
  },
  {
    url: `${WP}/2026/08/Chipotle_butternut_squash_soup-16.jpg`,
    width: 1200,
    height: 1800,
    alt: "A spoon holding a bite of golden, crusty seitan above a blue pot",
  },
  {
    url: `${WP}/2026/09/mashed_butternut_squash-8.jpg`,
    width: 1200,
    height: 1800,
    alt: "Cubed roasted butternut squash scattered on a worn metal baking tray",
  },
  {
    url: `${WP}/2026/09/vegan_pumpkin_cornbread-5.jpg`,
    width: 1200,
    height: 1800,
    alt: "A slice of pumpkin cake topped with whipped cream and pecans",
  },
] as const;

/** How many photographs each of the first N posts gets, to exercise the grids. */
const IMAGE_PLAN = [1, 2, 1, 3, 1, 4, 1, 1];

const THREADS: { match: string; tree: Reply[] }[] = [
  {
    match: "tofu",
    tree: [
      {
        who: "jordan",
        body: "Salting it the night before changed everything for me. It draws the water out so it actually browns instead of steaming in the pan.",
        replies: [
          {
            who: "adam",
            body: "That's the one. Wet tofu can't brown — you're boiling it in its own moisture. Overnight in the fridge, uncovered, is even better.",
            replies: [
              {
                who: "jordan",
                body: "Uncovered? I've been wrapping it in a towel this whole time.",
                replies: [
                  {
                    who: "adam",
                    body: "The towel works, it's just slower. Dry air does the job for free while you sleep.",
                  },
                ],
              },
            ],
          },
          { who: "priya", body: "Doing this tonight. My tofu has never once browned." },
        ],
      },
      {
        who: "lee",
        body: "Does this work with the soft stuff or only extra firm?",
        replies: [
          {
            who: "adam",
            body: "Extra firm only, I'm afraid. Silken will fall apart on you — save that for sauces.",
          },
        ],
      },
    ],
  },
  {
    match: "sauce",
    tree: [
      {
        who: "priya",
        body: "Mine always tastes flat and I never know whether it needs salt, acid or fat. Is there an order to check them in?",
        replies: [
          {
            who: "adam",
            body: "Salt first, always — most \"flat\" is just under-salted. Then acid, then fat last. If you add fat to fix flatness you just get a rich flat sauce.",
            replies: [
              {
                who: "priya",
                body: "Salt, acid, fat. Writing that on the inside of a cupboard door.",
              },
            ],
          },
        ],
      },
      {
        who: "sam",
        body: "A spoonful of the pasta water fixes about half of my sauce problems, for what it's worth.",
      },
    ],
  },
];

type Reply = { who: string; body: string; replies?: Reply[] };

async function main() {
  const url = process.env.DATABASE_URL ?? "";
  if (!/localhost|127\.0\.0\.1/.test(url)) {
    throw new Error(
      "seed-feed-demo is for local development only. DATABASE_URL does not look local.",
    );
  }

  const users = await prisma.user.findMany({
    where: { deletedAt: null },
    select: { id: true, handle: true },
  });
  const byHandle = new Map(users.map((u) => [u.handle, u.id]));
  if (users.length === 0) throw new Error("No users. Run the main seed first.");

  // 1. Stock photography out. The project rule is no stock imagery, and these
  //    were Unsplash URLs left over from the first seed.
  const stock = await prisma.postAttachment.deleteMany({
    where: { url: { contains: "unsplash.com" } },
  });
  const pinterest = await prisma.postAttachment.deleteMany({
    where: { url: { contains: "pinimg.com" } },
  });
  console.log(`removed ${stock.count + pinterest.count} stock attachments`);

  // 2. Adam's own photographs in, with real dimensions so the feed reserves
  //    the right space before they load.
  const posts = await prisma.post.findMany({
    where: { status: "PUBLISHED" },
    orderBy: { createdAt: "desc" },
    select: { id: true, title: true, plainText: true },
  });

  let dish = 0;
  let attached = 0;
  for (const [index, count] of IMAGE_PLAN.entries()) {
    const post = posts[index];
    if (!post) break;
    await prisma.postAttachment.deleteMany({ where: { postId: post.id } });
    for (let n = 0; n < count; n += 1) {
      const item = DISHES[dish % DISHES.length];
      dish += 1;
      await prisma.postAttachment.create({
        data: {
          postId: post.id,
          kind: "image",
          url: item.url,
          alt: item.alt,
          width: item.width,
          height: item.height,
          mimeType: "image/jpeg",
        },
      });
      attached += 1;
    }
  }
  console.log(`attached ${attached} real photographs across ${IMAGE_PLAN.length} posts`);

  // 3. Votes, so the rail has something to show. Deterministic rather than
  //    random, so the feed looks the same every run.
  let votes = 0;
  for (const [index, post] of posts.slice(0, 30).entries()) {
    const voters = users.filter((_, i) => (index + i) % 3 !== 2);
    for (const [i, voter] of voters.entries()) {
      const value = (index + i) % 7 === 0 ? -1 : 1;
      await prisma.vote.upsert({
        where: { userId_postId: { userId: voter.id, postId: post.id } },
        update: { value },
        create: { userId: voter.id, postId: post.id, value },
      });
      votes += 1;
    }
    const score = await prisma.vote.aggregate({
      where: { postId: post.id },
      _sum: { value: true },
    });
    await prisma.post.update({
      where: { id: post.id },
      data: { score: score._sum.value ?? 0 },
    });
  }
  console.log(`cast ${votes} votes and recomputed scores`);

  // 4. Reactions, so the like counts are not all zero.
  let reactions = 0;
  const EMOJI = ["❤️", "👍", "🎉", "🙌"];
  for (const [index, post] of posts.slice(0, 20).entries()) {
    for (const [i, user] of users.entries()) {
      if ((index + i) % 4 === 3) continue;
      const emoji = EMOJI[(index + i) % EMOJI.length];
      await prisma.reaction.upsert({
        where: { userId_postId_emoji: { userId: user.id, postId: post.id, emoji } },
        update: {},
        create: { userId: user.id, postId: post.id, emoji },
      });
      reactions += 1;
    }
  }
  console.log(`added ${reactions} reactions`);

  // 5. Threaded replies, so the nesting is visible.
  let comments = 0;
  for (const thread of THREADS) {
    const post = posts.find(
      (p) =>
        (p.title ?? "").toLowerCase().includes(thread.match) ||
        p.plainText.toLowerCase().includes(thread.match),
    );
    if (!post) {
      console.log(`  no post matched "${thread.match}", skipping that thread`);
      continue;
    }
    // Replace rather than duplicate, so re-running is safe.
    await prisma.comment.deleteMany({ where: { postId: post.id } });

    const walk = async (nodes: Reply[], parentId: string | null) => {
      for (const node of nodes) {
        const authorId = byHandle.get(node.who) ?? users[0].id;
        const created = await prisma.comment.create({
          data: {
            postId: post.id,
            authorId,
            parentId,
            body: node.body,
            plainText: node.body,
            bodyHtml: `<p>${node.body}</p>`,
            score: 0,
          },
        });
        comments += 1;
        if (node.replies?.length) await walk(node.replies, created.id);
      }
    };
    await walk(thread.tree, null);
    console.log(`  threaded ${post.title ?? post.id}`);
  }
  console.log(`wrote ${comments} threaded comments`);

  // 6. Pin one post, so the pinned treatment is visible.
  if (posts[3]) {
    await prisma.post.updateMany({
      where: { pinnedAt: { not: null } },
      data: { pinnedAt: null },
    });
    await prisma.post.update({
      where: { id: posts[3].id },
      data: { pinnedAt: new Date() },
    });
    console.log(`pinned "${posts[3].title ?? posts[3].id}"`);
  }
}

main()
  .then(() => prisma.$disconnect())
  .catch(async (error) => {
    console.error(error);
    await prisma.$disconnect();
    process.exit(1);
  });
