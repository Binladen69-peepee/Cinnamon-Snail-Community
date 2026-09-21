/**
 * Seed the member feed with one VIDEO post per class from the homepage library
 * (51 rows in data/class-library.json).
 *
 * Each post uses Adam's class title, the spreadsheet teaser as the video URL,
 * and the class still as `thumbnailUrl` so the feed shows a real poster before
 * play. Dummy reactions (likes), bookmarks (saves), votes (shares stand-in),
 * and comments are attached from seeded members.
 *
 * Idempotent: posts are keyed by `linkUrl = class-library:<slug>`, so re-running
 * replaces attachments and engagement without duplicating the feed.
 *
 *   npx tsx prisma/seed-class-posts.ts
 *
 * Uses DATABASE_URL from the environment (local or production).
 */
import { PrismaClient } from "@prisma/client";
import { renderMarkdown, toPlainText } from "../lib/markdown";
import { CLASS_LIBRARY, classSlug } from "../lib/marketing/class-library";
import { FEED_REACTIONS } from "../lib/community/reactions";

const prisma = new PrismaClient();

const DESCRIPTIONS: Record<string, string> = {
  "2023 Vegan Christmas Dinner Class": "A full Christmas dinner menu.",
  "2023 Vegan Thanksgiving Cooking Class": "Classic Thanksgiving sides and mains.",
  "A Colosseum of Vegan Eggs": "Every egg substitute, tested.",
  "A Vegan Hanukkah Kitchen: Root Veggies & Rituals":
    "Hanukkah, root-vegetable-forward.",
  "Approachable Vegan Desserts": "Easy desserts for any skill level.",
  "Around the World in Vegan Donuts": "Global donut styles, veganized.",
  "Bangin' Tex-Mex Casseroles": "Layered Tex-Mex comfort food.",
  "Eastern European Jewish Vegan Food": "Traditional Jewish dishes, veganized.",
  "Easy, Healthy Vegan Lunches": "Quick lunches for a normal week.",
  "Essential Mexican Salsas": "Every salsa you actually need.",
  "Gluten-Free Vegan Masterclass": "Gluten-free technique and swaps.",
  "Homestyle Moroccan Cooking": "Traditional Moroccan flavor and technique.",
  "Legacy Vegan Cooking Class": "Foundational plates from the archive.",
  "Make Better Meat, Vegan": "Convincing plant-based meat substitutes.",
  "Make the Best Plant-Based Pizza": "Dough, sauce, and toppings.",
  "Malaysian Vegan Cuisine": "Malaysian technique and regional specialties.",
  "Plant-Based Cheese School": "Cheese sauces and cheese blocks.",
  "Punjabi Thali Cuisine": "A full Punjabi multi-course spread.",
  "Saigon Flavor: Vegan Vietnamese Cooking Class":
    "Vietnamese street food, veganized.",
  "Sattvic Vegan Indian Cuisine": "Ayurvedic Indian cooking, plant-based.",
  "Seitan Masterclass": "Wheat-gluten protein, start to finish.",
  "Southern Vegan BBQ Class Pack": "Smoke, sauce, and sides.",
  "Spooky Vegan Halloween Party Prep": "Halloween party food, including donuts.",
  "The best falafel and vegan meze": "Falafel and Mediterranean spreads.",
  "The Best Falafel and Vegan Mezze": "Falafel and Mediterranean spreads.",
  "The best plant-based tacos": "Taco fillings and technique.",
  "The Best Plant-Based Tacos": "Taco fillings and technique.",
  "The Green Reaper: Vegan Salad Bible": "Salads worth building a meal around.",
  "The Perfect Vegan Brunch Cooking Class":
    "A full brunch spread, start to finish.",
  "Vegan Cake Donut Mastery": "Cake donuts, glazes, and flavors.",
  "Vegan Christmas Bundle Of Yummy": "A full Christmas dessert lineup.",
  "Vegan Dairy Crash Course": "Cheese, butter, and dairy from scratch.",
  "Vegan Dim Sum and Then Some": "Dim sum and small plates.",
  "Vegan Easter Dinner Class": "A festive Easter spread.",
  "Vegan Empanadas Made Easy": "Pastry and fillings, simplified.",
  "Vegan Filipino Cooking Class": "Classic Filipino dishes and flavors.",
  "Vegan Freezer Meals": "Batch cook now, eat all month.",
  "Vegan Indonesian BBQ": "Indonesian grilling with plant-based proteins.",
  "Vegan Italian American Cooking Class": "Red-sauce classics, veganized.",
  "Vegan Italian Desserts": "Classic Italian sweets, plant-based.",
  "Vegan Korean Fried Chicken Workshop": "Crispy, saucy, Korean-style.",
  "Vegan Mediterranean Cooking Class": "Mediterranean dishes, plant-based.",
  "Vegan Mexican Cooking": "Foundational Mexican technique and recipes.",
  "Vegan Mother's Day Cook-Along Brunch": "A full celebration brunch.",
  "Vegan Passover Prep-Along": "Passover-compliant recipes and planning.",
  "Vegan Sandwich Hall of Fame Cooking Class": "Next-level sandwich building.",
  "Vegan Shabbat Dinner": "A full plant-based Shabbat table.",
  "Vegan Soup Workshop": "Soups and stews, several styles.",
  "Vegan Thai Kitchen Adventures": "Thai technique and flavor building.",
  "Vegan Thanksgiving Training Camp": "The whole Thanksgiving table.",
  "Vegan Turkish Cuisine": "Turkish specialties, plant-based.",
  "Vegan Valentine's Treats": "Romantic desserts for two.",
  "Veganized Chinese Takeout Classics": "Takeout favorites, made plant-based.",
};

const COMMENT_POOL = [
  "Just put this on my watch list — the thumbnail alone sold me.",
  "Made something from this last week and it actually worked on a weeknight.",
  "Adam explaining the sauce at 0:40 is the part I needed.",
  "Bookmarking this for Sunday. Who else is cooking along?",
  "The still looks exactly like what came out of my pan. Wild.",
  "Shared this with my group chat already.",
  "Is the full class in Course Hall? Asking for a friend who keeps burning garlic.",
  "That technique alone is worth the membership.",
];

function marker(slug: string) {
  return `class-library:${slug}`;
}

function mulberry32(seed: number) {
  return function next() {
    seed |= 0;
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

async function main() {
  if (CLASS_LIBRARY.length !== 51) {
    throw new Error(
      `Expected 51 classes in the library, found ${CLASS_LIBRARY.length}.`,
    );
  }

  const adam = await prisma.user.findUnique({ where: { handle: "adam" } });
  if (!adam) throw new Error("Adam user missing. Run the main seed first.");

  const space =
    (await prisma.space.findUnique({ where: { slug: "course-hall" } })) ??
    (await prisma.space.findUnique({ where: { slug: "kitchen-table" } }));
  if (!space) throw new Error("No Course Hall / Kitchen Table space found.");

  const members = await prisma.user.findMany({
    where: { deletedAt: null },
    select: { id: true, handle: true },
    take: 80,
  });
  if (members.length < 2) {
    throw new Error("Need at least two users for engagement. Run the main seed first.");
  }

  const membership = await prisma.spaceMembership.findUnique({
    where: { spaceId_userId: { spaceId: space.id, userId: adam.id } },
  });
  if (!membership) {
    await prisma.spaceMembership.create({
      data: { spaceId: space.id, userId: adam.id, role: "HOST" },
    });
  }

  let created = 0;
  let updated = 0;

  for (const [index, cls] of CLASS_LIBRARY.entries()) {
    const slug = cls.slug || classSlug(cls.title);
    const key = marker(slug);
    const rand = mulberry32(index * 997 + 42);
    const blurb =
      DESCRIPTIONS[cls.title] ??
      "A cook-along from the Vegan University class library.";
    const body = `${blurb}\n\nTeaser from **${cls.title}**. Full class lives in Course Hall.`;
    const bodyHtml = renderMarkdown(body);
    const plainText = toPlainText(body);
    const publishedAt = new Date(Date.now() - (index + 1) * 36e5 * 5);

    const likeCount = 12 + Math.floor(rand() * 90);
    const saveCount = 3 + Math.floor(rand() * 18);
    const shareCount = 2 + Math.floor(rand() * 12);
    const commentCount = 2 + Math.floor(rand() * 5);
    const score = likeCount + saveCount + shareCount;

    const existing = await prisma.post.findFirst({
      where: { linkUrl: key },
      select: { id: true },
    });

    const attachment = {
      kind: "video",
      url: cls.teaserUrl,
      alt: cls.title,
      mimeType: "video/youtube",
      width: 1280,
      height: 720,
      thumbnailUrl: cls.thumbnailUrl,
    };

    let postId: string;
    if (existing) {
      postId = existing.id;
      await prisma.post.update({
        where: { id: postId },
        data: {
          title: cls.title,
          body,
          bodyHtml,
          plainText,
          type: "VIDEO",
          status: "PUBLISHED",
          publishedAt,
          score,
          spaceId: space.id,
          authorId: adam.id,
        },
      });
      await prisma.postAttachment.deleteMany({ where: { postId } });
      await prisma.reaction.deleteMany({ where: { postId } });
      await prisma.bookmark.deleteMany({ where: { postId } });
      await prisma.vote.deleteMany({ where: { postId } });
      await prisma.comment.deleteMany({ where: { postId } });
      updated += 1;
    } else {
      const post = await prisma.post.create({
        data: {
          spaceId: space.id,
          authorId: adam.id,
          type: "VIDEO",
          status: "PUBLISHED",
          title: cls.title,
          body,
          bodyHtml,
          plainText,
          linkUrl: key,
          publishedAt,
          score,
        },
      });
      postId = post.id;
      created += 1;
    }

    await prisma.postAttachment.create({
      data: { postId, ...attachment },
    });

    // Likes / reactions — one emoji per member (matches the product rule).
    const reactors = shuffle(members, rand).slice(
      0,
      Math.min(members.length, likeCount),
    );
    for (const [i, user] of reactors.entries()) {
      const emoji =
        FEED_REACTIONS[i % FEED_REACTIONS.length]!.emoji;
      try {
        await prisma.reaction.create({
          data: { userId: user.id, postId, emoji },
        });
      } catch {
        // unique (userId, postId, emoji)
      }
    }

    // Saves
    const savers = shuffle(members, rand).slice(
      0,
      Math.min(members.length, saveCount),
    );
    for (const user of savers) {
      try {
        await prisma.bookmark.create({
          data: { userId: user.id, postId },
        });
      } catch {
        // unique bookmark
      }
    }

    // Shares stand-in: upvotes (no Share table yet)
    const sharers = shuffle(members, rand).slice(
      0,
      Math.min(members.length, shareCount),
    );
    for (const user of sharers) {
      try {
        await prisma.vote.create({
          data: { userId: user.id, postId, value: 1 },
        });
      } catch {
        // unique vote
      }
    }

    // Comments
    const commenters = shuffle(
      members.filter((m) => m.handle !== "adam"),
      rand,
    );
    for (let i = 0; i < commentCount; i++) {
      const user = commenters[i % Math.max(commenters.length, 1)] ?? members[0]!;
      const text = COMMENT_POOL[Math.floor(rand() * COMMENT_POOL.length)]!;
      await prisma.comment.create({
        data: {
          postId,
          authorId: user.id,
          body: text,
          bodyHtml: renderMarkdown(text),
          plainText: toPlainText(text),
          createdAt: new Date(publishedAt.getTime() + (i + 1) * 9e5),
        },
      });
    }

    await prisma.searchIndex.upsert({
      where: {
        entityType_entityId: { entityType: "post", entityId: postId },
      },
      create: {
        entityType: "post",
        entityId: postId,
        title: cls.title,
        body: plainText,
        spaceId: space.id,
      },
      update: {
        title: cls.title,
        body: plainText,
        spaceId: space.id,
      },
    });
  }

  console.log(
    `Class posts ready: ${created} created, ${updated} updated (${CLASS_LIBRARY.length} total) in #${space.slug}.`,
  );
}

function shuffle<T>(items: T[], rand: () => number): T[] {
  const copy = [...items];
  for (let i = copy.length - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1));
    [copy[i], copy[j]] = [copy[j]!, copy[i]!];
  }
  return copy;
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
