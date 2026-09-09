import type { PostType, PrismaClient } from "@prisma/client";
import { renderMarkdown, toPlainText } from "../lib/markdown";

export const TEST_FEED_MARK = "vu-seed-test-feed";
const TARGET_COUNT = 54;

const FOOD_IMAGES = [
  {
    url: "https://images.unsplash.com/photo-1540420773420-3366772f4999?auto=format&fit=crop&w=1400&q=80",
    alt: "A colorful vegan grain bowl",
  },
  {
    url: "https://images.unsplash.com/photo-1512621776951-a57141f2eefd?auto=format&fit=crop&w=1400&q=80",
    alt: "Chopped vegetables and citrus",
  },
  {
    url: "https://images.unsplash.com/photo-1466637574441-749b8f19452f?auto=format&fit=crop&w=1400&q=80",
    alt: "Hands preparing vegetables",
  },
  {
    url: "https://images.unsplash.com/photo-1414235077428-338989a2e8c0?auto=format&fit=crop&w=1400&q=80",
    alt: "A shared table of plated food",
  },
  {
    url: "https://images.unsplash.com/photo-1507048331197-7d4ac70811cf?auto=format&fit=crop&w=1400&q=80",
    alt: "Cooking vegetables in a pan",
  },
  {
    url: "https://images.unsplash.com/photo-1540189549336-e6e99c3679fe?auto=format&fit=crop&w=1400&q=80",
    alt: "A salad with herbs and tomato",
  },
];

const VIDEO_URLS = [
  "https://www.youtube.com/watch?v=jNQXAC9IVRw",
  "https://youtu.be/jNQXAC9IVRw",
  "https://www.youtube.com/watch?v=aqz-KE-bpKQ",
];

const LINK_URLS = [
  "https://en.wikipedia.org/wiki/Tempeh",
  "https://en.wikipedia.org/wiki/Tofu",
  "https://en.wikipedia.org/wiki/Seitan",
  "https://en.wikipedia.org/wiki/Nutritional_yeast",
];

const TYPES: PostType[] = [
  "SIMPLE",
  "ARTICLE",
  "QUESTION",
  "POLL",
  "EVENT",
  "LINK",
  "IMAGE",
  "VIDEO",
  "RECIPE",
];

type Author = { id: string };
type Space = { id: string; slug: string; postingPermission: string };

export async function seedTestFeed(
  prisma: PrismaClient,
  input: { authors: Author[]; spaces: Space[]; hostId: string },
) {
  const existing = await prisma.post.count({
    where: { plainText: { contains: TEST_FEED_MARK } },
  });
  if (existing >= TARGET_COUNT) {
    console.log(`Test feed already has ${existing} posts.`);
    return;
  }

  const kitchen = input.spaces.find((space) => space.slug === "kitchen-table") ?? input.spaces[0];
  const porch = input.spaces.find((space) => space.slug === "calendar-porch") ?? kitchen;
  const garden = input.spaces.find((space) => space.slug === "member-garden") ?? kitchen;
  const hall = input.spaces.find((space) => space.slug === "course-hall") ?? kitchen;
  if (!kitchen) throw new Error("Need a space to seed the test feed.");

  const recipes = [];
  for (let index = 0; index < 6; index += 1) {
    const slug = `test-feed-recipe-${index + 1}`;
    const recipe = await prisma.recipe.upsert({
      where: { slug },
      update: {},
      create: {
        slug,
        title: `Seeded recipe ${index + 1}: weeknight lentils`,
        body: "Red lentils, onion, garlic, lemon. Serve over rice.",
        coverUrl: FOOD_IMAGES[index % FOOD_IMAGES.length]!.url,
      },
    });
    recipes.push(recipe);
  }

  const events = [];
  for (let index = 0; index < 6; index += 1) {
    const startsAt = new Date(Date.now() + (index + 2) * 86_400_000);
    const event = await prisma.event.create({
      data: {
        spaceId: porch?.id,
        title: `Seeded potluck ${index + 1}`,
        description: "Bring a plate and a question. Testing event posts.",
        startsAt,
        location: index % 2 === 0 ? "Kitchen Table" : "Zoom",
        coverUrl: FOOD_IMAGES[index % FOOD_IMAGES.length]!.url,
      },
    });
    events.push(event);
  }

  let created = 0;
  for (let index = 0; index < TARGET_COUNT; index += 1) {
    const type = TYPES[index % TYPES.length]!;
    const author =
      type === "ARTICLE" && hall?.postingPermission === "HOSTS_ONLY"
        ? { id: input.hostId }
        : input.authors[index % input.authors.length]!;
    const space = spaceForType(type, { kitchen, porch, garden, hall });
    const n = Math.floor(index / TYPES.length) + 1;
    const spec = buildSpec(type, n, index);
    const publishedAt = new Date(Date.now() - (index + 1) * 3_600_000 * 5);
    const body = `${spec.body}\n\n_${TEST_FEED_MARK}_`;

    await prisma.post.create({
      data: {
        spaceId: space.id,
        authorId: author.id,
        type,
        status: "PUBLISHED",
        title: spec.title,
        body,
        bodyHtml: renderMarkdown(body),
        plainText: toPlainText(body),
        linkUrl: spec.linkUrl,
        publishedAt,
        score: spec.score,
        eventId: type === "EVENT" ? events[n - 1]?.id : undefined,
        recipeId: type === "RECIPE" ? recipes[n - 1]?.id : undefined,
        attachments: spec.image
          ? { create: { kind: "image", url: spec.image.url, alt: spec.image.alt } }
          : undefined,
        pollOptions: spec.poll
          ? {
              create: spec.poll.map((label, sortOrder) => ({ label, sortOrder })),
            }
          : undefined,
      },
    });
    created += 1;
  }

  console.log(`Seeded ${created} test-feed posts across ${TYPES.join(", ")}.`);
}

function spaceForType(
  type: PostType,
  spaces: { kitchen: Space; porch: Space; garden: Space; hall: Space },
) {
  if (type === "EVENT") return spaces.porch;
  if (type === "QUESTION") return spaces.garden;
  if (type === "ARTICLE") return spaces.hall;
  return spaces.kitchen;
}

function buildSpec(type: PostType, n: number, index: number) {
  const image = FOOD_IMAGES[index % FOOD_IMAGES.length]!;
  const score = (index * 3) % 21;
  switch (type) {
    case "SIMPLE":
      return {
        title: `Test simple ${n}: what is on the counter`,
        body: `A short plate note. I roasted cauliflower with too much lemon and it still worked. Round ${n}.`,
        score,
      };
    case "ARTICLE":
      return {
        title: `Test article ${n}: how I stopped fearing tofu`,
        body: `## The pan\n\nPress it. Salt it. Leave it alone.\n\n## The sauce\n\nSoy, maple, and a splash of vinegar. That is the whole method for round ${n}.`,
        score,
      };
    case "QUESTION":
      return {
        title: `Test question ${n}: which vinegar for slaw?`,
        body: `Rice vinegar keeps winning, but I wonder if apple cider would be brighter. What do you use?`,
        score,
      };
    case "POLL":
      return {
        title: `Test poll ${n}: Friday dinner vote`,
        body: `Pick the plate you actually want to cook this week.`,
        poll: ["Lentil pasta", "Tofu scramble", "Grain bowl", "Soup and bread"],
        score,
      };
    case "EVENT":
      return {
        title: `Test event ${n}: potluck on the porch`,
        body: `Bring something that traveled well. We will eat, then talk through the sauce questions.`,
        score,
      };
    case "LINK":
      return {
        title: `Test link ${n}: a page worth bookmarking`,
        body: `I keep sending this to people who ask what tempeh even is.`,
        linkUrl: LINK_URLS[index % LINK_URLS.length],
        score,
      };
    case "IMAGE":
      return {
        title: `Test image ${n}: the plate before anyone sat down`,
        body: `Lighting was an accident. The herbs were on purpose.`,
        image,
        score,
      };
    case "VIDEO":
      return {
        title: `Test video ${n}: technique I keep replaying`,
        body: `Watch the heat, not the clock.`,
        linkUrl: VIDEO_URLS[index % VIDEO_URLS.length],
        score,
      };
    case "RECIPE":
      return {
        title: `Test recipe ${n}: red lentils in one pot`,
        body: `**Ingredients**\n- 1 cup red lentils\n- Onion, garlic, lemon\n- Salt\n\n**Method**\nSimmer until they collapse. Finish with oil and herbs.`,
        image,
        score,
      };
    default:
      return { title: `Test post ${n}`, body: "A seeded post.", score };
  }
}
