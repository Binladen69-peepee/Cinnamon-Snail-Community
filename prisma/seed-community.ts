import { PrismaClient, type PostType } from "@prisma/client";
import bcrypt from "bcryptjs";
import { renderMarkdown, toPlainText } from "../lib/markdown";
import { CLASS_LIBRARY, photoForKnownClass } from "../lib/marketing/class-library";

/**
 * A community with something in it.
 *
 * Replaces the member and post data with a cast big enough to exercise every
 * surface the app has: a follow graph that is lopsided rather than uniform,
 * posts of every type the composer can make, threaded comments, and engagement
 * spread unevenly so ranking has something to rank.
 *
 * Three rules this file keeps:
 *
 * 1. **The class catalog survives untouched.** The 52 published courses, the
 *    spaces, and the billing products are not seed decoration — they are the
 *    product. Posts reference classes by title so the catalog shows up in the
 *    feed, rather than the feed inventing a parallel set of dishes.
 * 2. **The admin account is upserted, never deleted.** Its email is a `.test`
 *    address that cannot receive a magic link, so dropping the row would lock
 *    the only administrator out of production for good.
 * 3. **Nothing invents a real person.** Every member here is obviously a seeded
 *    persona with a `@veganuniversity.test` address.
 */

const PASSWORD = "vegan-local-dev";

type Persona = {
  handle: string;
  name: string;
  city: string;
  country: string;
  bio: string;
  skill: "beginner" | "confident" | "advanced";
  interests: string[];
  /** Roughly how much this member posts, which shapes the follow graph too. */
  voice: "host" | "regular" | "quiet" | "new";
};

const PEOPLE: Persona[] = [
  { handle: "adam", name: "Adam Sobel", city: "Los Angeles", country: "USA",
    bio: "Founder and host. Twenty years of cooking, still burning the garlic.",
    skill: "advanced", interests: ["technique", "sauces", "bbq"], voice: "host" },
  { handle: "priya", name: "Priya Raghavan", city: "Chicago", country: "USA",
    bio: "Dal, bread, and the sauce question at 9pm. Cooking for four every night.",
    skill: "advanced", interests: ["indian", "batch cooking", "spice"], voice: "regular" },
  { handle: "jordan", name: "Jordan Ellis", city: "Austin", country: "USA",
    bio: "Weeknight tofu and too many citrus recipes. Learning to bake.",
    skill: "confident", interests: ["weeknight dinners", "tofu", "citrus"], voice: "regular" },
  { handle: "lee", name: "Lee Nakamura", city: "Seattle", country: "USA",
    bio: "Fermenting things in the garage. Ask me about koji.",
    skill: "advanced", interests: ["fermentation", "japanese", "umami"], voice: "regular" },
  { handle: "mara", name: "Mara Oyelaran", city: "Lagos", country: "Nigeria",
    bio: "West African cooking, plant-based. Jollof is a hill I will die on.",
    skill: "advanced", interests: ["west african", "stews", "peppers"], voice: "regular" },
  { handle: "tomas", name: "Tomás Herrera", city: "Mexico City", country: "Mexico",
    bio: "Masa, salsas, and the long braise. Tortillas by hand or not at all.",
    skill: "advanced", interests: ["mexican", "masa", "salsa"], voice: "regular" },
  { handle: "yuki", name: "Yuki Tanaka", city: "Osaka", country: "Japan",
    bio: "Vegan ramen obsessive. Broth takes as long as it takes.",
    skill: "confident", interests: ["ramen", "japanese", "broth"], voice: "regular" },
  { handle: "noor", name: "Noor Haddad", city: "Amman", country: "Jordan",
    bio: "Mezze for twelve, every Friday. Tahini in everything.",
    skill: "confident", interests: ["middle eastern", "mezze", "tahini"], voice: "regular" },
  { handle: "ines", name: "Inès Moreau", city: "Lyon", country: "France",
    bio: "Pastry, mostly. Vegan laminated dough is a personal vendetta.",
    skill: "advanced", interests: ["baking", "pastry", "desserts"], voice: "regular" },
  { handle: "dev", name: "Dev Patel", city: "Leicester", country: "UK",
    bio: "Cooking for one and refusing to be sad about it.",
    skill: "confident", interests: ["weeknight dinners", "curry", "meal prep"], voice: "quiet" },
  { handle: "sam", name: "Sam Okafor", city: "Red Bank", country: "USA",
    bio: "Soups, batch cooking, and feeding a house of five.",
    skill: "confident", interests: ["soups", "batch cooking", "budget"], voice: "quiet" },
  { handle: "wren", name: "Wren Halloway", city: "Portland", country: "USA",
    bio: "Gluten-free and figuring it out loudly. Three months in.",
    skill: "beginner", interests: ["gluten-free", "baking", "basics"], voice: "new" },
  { handle: "kofi", name: "Kofi Mensah", city: "Accra", country: "Ghana",
    bio: "Groundnut stew evangelist. New here, cooking every day.",
    skill: "beginner", interests: ["west african", "stews", "basics"], voice: "new" },
  { handle: "elena", name: "Elena Costa", city: "Lisbon", country: "Portugal",
    bio: "Learning knife skills at 52. It is going fine, mostly.",
    skill: "beginner", interests: ["technique", "basics", "mediterranean"], voice: "new" },
];

/** Tags a post can carry. Real topics, so search and reading both benefit. */
const TAGS: Record<string, string[]> = {
  technique: ["#technique", "#knifeskills"],
  baking: ["#veganbaking", "#pastry"],
  weeknight: ["#weeknight", "#30minutes"],
  batch: ["#batchcooking", "#mealprep"],
  glutenfree: ["#glutenfree"],
  regional: ["#worldcuisine"],
  question: ["#askthekitchen"],
  win: ["#firstcook", "#itworked"],
};

type Seeded = { id: string; handle: string; voice: Persona["voice"] };

function pick<T>(list: T[], n: number): T {
  return list[n % list.length];
}

/** Deterministic pseudo-random, so a reseed produces the same community. */
function rng(seed: number) {
  let value = seed;
  return () => {
    value = (value * 1664525 + 1013904223) % 4294967296;
    return value / 4294967296;
  };
}

export async function seedCommunity(prisma: PrismaClient) {
  const random = rng(20260923);
  const passwordHash = await bcrypt.hash(PASSWORD, 12);

  // ---------------------------------------------------------------- people
  const memberRole = await prisma.role.upsert({
    where: { name: "MEMBER" }, update: {}, create: { name: "MEMBER" },
  });
  const adminRole = await prisma.role.upsert({
    where: { name: "ADMIN" }, update: {}, create: { name: "ADMIN" },
  });

  const people: Seeded[] = [];
  for (const person of PEOPLE) {
    const email = `${person.handle}@veganuniversity.test`;
    const user = await prisma.user.upsert({
      where: { email },
      update: { status: "ACTIVE", name: person.name, passwordHash, emailVerified: new Date() },
      create: {
        email, handle: person.handle, name: person.name, passwordHash,
        emailVerified: new Date(), status: "ACTIVE",
        emails: { create: { email, isPrimary: true, verifiedAt: new Date() } },
      },
      select: { id: true, handle: true },
    });

    await prisma.profile.upsert({
      where: { userId: user.id },
      update: {
        displayName: person.name, bio: person.bio, city: person.city,
        country: person.country, skillLevel: person.skill,
        cookingInterests: person.interests, directoryVisible: true,
      },
      create: {
        userId: user.id, displayName: person.name, bio: person.bio,
        city: person.city, country: person.country, skillLevel: person.skill,
        cookingInterests: person.interests, directoryVisible: true,
      },
    });

    await prisma.userRole.upsert({
      where: { userId_roleId: { userId: user.id, roleId: memberRole.id } },
      update: {}, create: { userId: user.id, roleId: memberRole.id },
    });
    if (person.voice === "host") {
      await prisma.userRole.upsert({
        where: { userId_roleId: { userId: user.id, roleId: adminRole.id } },
        update: {}, create: { userId: user.id, roleId: adminRole.id },
      });
    }

    people.push({ id: user.id, handle: person.handle, voice: person.voice });
  }

  // ------------------------------------------------------------- follows
  // Lopsided on purpose: the host is followed by nearly everyone, the newest
  // members follow a handful, and a uniform graph would make "people you
  // should meet" meaningless.
  await prisma.follow.deleteMany({});
  const reach: Record<Persona["voice"], number> = { host: 1, regular: 0.55, quiet: 0.3, new: 0.15 };
  for (const target of people) {
    for (const follower of people) {
      if (follower.id === target.id) continue;
      if (random() > reach[target.voice]) continue;
      await prisma.follow.create({
        data: { followerId: follower.id, followingId: target.id },
      }).catch(() => undefined);
    }
  }

  // ------------------------------------------------------------- spaces
  const spaces = await prisma.space.findMany({
    where: { visibility: { in: ["PUBLIC", "MEMBERS"] } },
    select: { id: true, slug: true, kind: true },
  });
  const kitchen = spaces.find((s) => s.slug === "kitchen-table") ?? spaces[0];
  const courseHall = spaces.find((s) => s.kind === "COURSE") ?? kitchen;

  for (const person of people) {
    for (const space of spaces) {
      await prisma.spaceMembership.upsert({
        where: { spaceId_userId: { spaceId: space.id, userId: person.id } },
        update: {},
        create: {
          spaceId: space.id, userId: person.id,
          role: person.voice === "host" ? "HOST" : "MEMBER",
        },
      });
    }
  }

  return { people, kitchen, courseHall, random };
}

/**
 * Posts built around the real class catalog.
 *
 * The classes are the substance of this community, so they are what members
 * talk about: each class-derived post carries the real title, the real still
 * and a caption written as a member would write it, rather than the feed
 * running a parallel set of invented dishes beside the catalog.
 */
export async function seedPosts(
  prisma: PrismaClient,
  ctx: Awaited<ReturnType<typeof seedCommunity>>,
) {
  const { people, kitchen, courseHall } = ctx;
  const byHandle = new Map(people.map((p) => [p.handle, p]));

  const courses = await prisma.course.findMany({
    where: { published: true },
    orderBy: [{ categoryOrder: "asc" }, { title: "asc" }],
    select: { title: true, slug: true, category: true, coverUrl: true },
  });
  const sheet = new Map(CLASS_LIBRARY.map((c) => [c.title.toLowerCase(), c]));

  type Draft = {
    author: string;
    type: PostType;
    title?: string;
    body: string;
    spaceId: string;
    photo?: string | null;
    teaser?: string | null;
    poll?: string[];
    link?: string;
    hoursAgo: number;
  };

  const drafts: Draft[] = [];
  let hour = 2;

  // --- Class-derived posts: the catalog, talked about ---------------------
  const CLASS_VOICES = [
    (t: string, c: string | null) =>
      `Finally worked through **${t}** this weekend. ${c ? `Filed under ${c},` : "Filed"} but honestly it taught me more about seasoning than anything else I've cooked this year.\n\n${TAGS.technique.join(" ")}`,
    (t: string) =>
      `Second attempt at **${t}** and the difference was patience. Let it go ten minutes longer than felt right and that was the whole trick.\n\n${TAGS.win.join(" ")}`,
    (t: string) =>
      `Anyone else done **${t}**? Got halfway and realised I'd been rushing the base. Starting again tonight.\n\n${TAGS.question.join(" ")}`,
    (t: string, c: string | null) =>
      `**${t}** is the one I keep coming back to.${c ? ` Everything in ${c} has been good but this one stuck.` : ""} Made it three times now, changed something each time.\n\n${TAGS.regional.join(" ")}`,
    (t: string) =>
      `Cooked **${t}** for six people and nobody asked where the meat was. Counting that as a win.\n\n${TAGS.win.join(" ")}`,
  ];

  courses.forEach((course, index) => {
    const author = pick(people.filter((p) => p.voice !== "new"), index * 3 + 1);
    const voice = CLASS_VOICES[index % CLASS_VOICES.length];
    const match = sheet.get(course.title.trim().toLowerCase());
    drafts.push({
      author: author.handle,
      type: match?.teaserUrl ? "VIDEO" : "IMAGE",
      title: course.title,
      body: voice(course.title, course.category),
      spaceId: index % 4 === 0 ? courseHall.id : kitchen.id,
      photo: photoForKnownClass(course.title, course.coverUrl),
      teaser: match?.teaserUrl ?? null,
      hoursAgo: (hour += 5),
    });
  });

  // --- Ordinary community posts -------------------------------------------
  const CHATTER: Omit<Draft, "spaceId" | "hoursAgo">[] = [
    { author: "wren", type: "QUESTION", title: "Gluten-free pastry that doesn't crumble?",
      body: "Third batch this week and it still falls apart the second it cools. I'm using a 1:1 blend. Is it the flour or is it me?\n\n#glutenfree #veganbaking #askthekitchen" },
    { author: "yuki", type: "SIMPLE",
      body: "Twelve hours on the broth. Twelve. My flat smells incredible and I have regrets about none of it.\n\n#ramen #worldcuisine" },
    { author: "ines", type: "POLL", title: "Which should I film next?",
      body: "I've got time for one properly this month.\n\n#veganbaking",
      poll: ["Laminated croissant dough", "Choux and craquelin", "Sourdough discard pastry", "Entremet, the full build"] },
    { author: "tomas", type: "SIMPLE",
      body: "Reminder that a salsa made in a molcajete and one made in a blender are two different foods wearing the same name.\n\n#salsa #technique" },
    { author: "mara", type: "ARTICLE", title: "Jollof, and why the rice matters more than the pepper",
      body: "Everyone argues about the pepper base. Fine. But I've made this with four different rices now and that's where it's actually won or lost.\n\nLong grain parboiled, washed until the water runs clear, and then *dried* before it goes near the pot. If it goes in wet you get porridge with ambition.\n\n#worldcuisine #technique" },
    { author: "noor", type: "SIMPLE",
      body: "Friday mezze for twelve. Seven dips, four breads, one very tired person.\n\n#mezze #worldcuisine" },
    { author: "dev", type: "QUESTION", title: "Cooking for one without eating the same thing five nights running",
      body: "I batch cook and then resent it by Wednesday. How are people splitting this up?\n\n#mealprep #weeknight #askthekitchen" },
    { author: "lee", type: "SIMPLE",
      body: "Koji update: week three, smells like sweet chestnut, has not killed me. Will report back.\n\n#fermentation" },
    { author: "priya", type: "SIMPLE",
      body: "The 9pm sauce question answered once and for all: it's acid. It's always acid. Squeeze the lemon.\n\n#technique #weeknight" },
    { author: "kofi", type: "SIMPLE",
      body: "First groundnut stew that tasted like my mother's. Took four tries. Nearly cried into the pot.\n\n#firstcook #worldcuisine" },
    { author: "elena", type: "QUESTION", title: "Am I too old to learn proper knife skills?",
      body: "52, been cooking badly for thirty years, finally want to do it right. Where does someone actually start?\n\n#knifeskills #basics #askthekitchen" },
    { author: "jordan", type: "LINK", title: "A good piece on why tofu pressing is mostly unnecessary",
      body: "Goes against everything I was told. Tried it their way and honestly? Same result, twenty minutes saved.\n\n#tofu #weeknight",
      link: "https://www.seriouseats.com/how-to-cook-tofu" },
    { author: "sam", type: "SIMPLE",
      body: "Six litres of soup, four containers, one freezer that no longer closes. Sunday well spent.\n\n#batchcooking #budget" },
    { author: "adam", type: "ARTICLE", title: "What I look for when I taste your food",
      body: "A few of you have asked what I'm actually checking when I taste something in a live class. It's four things, in this order:\n\n**Salt.** Almost every dish that arrives 'missing something' is under-salted. Not seasoned at the end — salted at each stage.\n\n**Acid.** The second most common gap. Lemon, vinegar, tamarind, pickle liquid. Something to cut through.\n\n**Texture.** One dish, one contrast. Soft needs crisp. Rich needs sharp.\n\n**Heat, last.** Chilli is a finish, not a foundation.\n\nIf a dish has all four and still feels flat, then we talk about technique.\n\n#technique #askthekitchen" },
    { author: "adam", type: "POLL", title: "Next live cook-along — you pick",
      body: "Whichever wins, we film it in two weeks.\n\n#worldcuisine",
      poll: ["A proper dal, four ways", "Handmade masa and tortillas", "Vegan ramen from scratch", "Mezze, the full spread"] },
  ];

  for (const draft of CHATTER) {
    drafts.push({
      ...draft,
      spaceId: kitchen.id,
      hoursAgo: (hour += 3),
    });
  }

  // --- Write them ---------------------------------------------------------
  const created: { id: string; authorId: string; hoursAgo: number }[] = [];

  for (const draft of drafts) {
    const author = byHandle.get(draft.author);
    if (!author) continue;
    const publishedAt = new Date(Date.now() - draft.hoursAgo * 3_600_000);

    const post = await prisma.post.create({
      data: {
        spaceId: draft.spaceId,
        authorId: author.id,
        type: draft.type,
        status: "PUBLISHED",
        title: draft.title,
        body: draft.body,
        bodyHtml: renderMarkdown(draft.body),
        plainText: toPlainText(draft.body),
        linkUrl: draft.link,
        publishedAt,
        createdAt: publishedAt,
        // Left at zero here and set from real votes once engagement exists.
        // A random score would let "Top" rank a post nobody reacted to above
        // one with forty likes, which is the one thing Top must never do.
        score: 0,
        ...(draft.photo || draft.teaser
          ? {
              attachments: {
                create: [
                  draft.teaser
                    ? { kind: "video", url: draft.teaser, thumbnailUrl: draft.photo ?? null, alt: draft.title ?? "" }
                    : { kind: "image", url: draft.photo!, alt: draft.title ?? "" },
                ],
              },
            }
          : {}),
        ...(draft.poll
          ? { pollOptions: { create: draft.poll.map((label, i) => ({ label, sortOrder: i })) } }
          : {}),
      },
      select: { id: true, authorId: true },
    });
    created.push({ ...post, hoursAgo: draft.hoursAgo });
  }

  return created;
}

/**
 * Engagement.
 *
 * Spread unevenly and anchored to each post's own age, so a post cannot have
 * been liked before it existed and the feed's ranking has a real distribution
 * to sort rather than a flat one.
 */
export async function seedEngagement(
  prisma: PrismaClient,
  ctx: Awaited<ReturnType<typeof seedCommunity>>,
  posts: { id: string; authorId: string; hoursAgo: number }[],
) {
  const { people, random } = ctx;
  const EMOJI = ["👍", "🎉", "🤗", "❤️", "💡", "😆", "🙌"];

  const REPLIES = [
    "This is the nudge I needed, thank you.",
    "Tried it tonight. Worked.",
    "How long did you leave it before turning?",
    "Saving this for the weekend.",
    "Okay but where do you get the good tahini",
    "Been doing this wrong for years apparently.",
    "The acid tip alone was worth reading.",
    "Made a half batch to test — going full next time.",
    "Same thing happened to me. It was the heat, too high.",
    "Sending this to my sister immediately.",
  ];

  for (const post of posts) {
    const others = people.filter((person) => person.id !== post.authorId);
    const popularity = random();
    const likeCount = Math.floor(popularity * others.length);

    for (let i = 0; i < likeCount; i += 1) {
      const person = others[(i * 3 + Math.floor(popularity * 7)) % others.length];
      await prisma.reaction
        .create({
          data: {
            postId: post.id,
            userId: person.id,
            emoji: EMOJI[Math.floor(random() * EMOJI.length)],
          },
        })
        .catch(() => undefined);
    }

    // Votes track likes loosely rather than exactly: the two are different
    // signals and a feed where they match perfectly looks generated.
    let votes = 0;
    for (let i = 0; i < Math.floor(likeCount * 0.6); i += 1) {
      const person = others[(i * 5) % others.length];
      const cast = await prisma.vote
        .create({ data: { postId: post.id, userId: person.id, value: 1 } })
        .then(() => 1)
        .catch(() => 0);
      votes += cast;
    }

    // `score` is the net vote count the feed sorts on, so it is written from
    // the votes that actually exist rather than invented alongside them.
    if (votes > 0) {
      await prisma.post.update({
        where: { id: post.id },
        data: { score: votes },
      });
    }

    // Saves are rarer than likes, as they are in every real feed.
    if (popularity > 0.62) {
      const saver = others[Math.floor(random() * others.length)];
      await prisma.bookmark
        .create({ data: { postId: post.id, userId: saver.id } })
        .catch(() => undefined);
    }

    if (popularity > 0.4) {
      const replyCount = 1 + Math.floor(random() * 3);
      let previous: string | null = null;
      for (let i = 0; i < replyCount; i += 1) {
        const person = others[(i * 4 + 1) % others.length];
        const body = REPLIES[Math.floor(random() * REPLIES.length)];
        const at = new Date(Date.now() - (post.hoursAgo - 1 - i) * 3_600_000);
        const comment: { id: string } = await prisma.comment.create({
          data: {
            postId: post.id,
            authorId: person.id,
            body,
            bodyHtml: renderMarkdown(body),
            plainText: toPlainText(body),
            // Roughly a third of replies answer another reply rather than the
            // post, so threads have depth to render.
            parentId: previous && random() > 0.66 ? previous : null,
            createdAt: at,
          },
          select: { id: true },
        });
        previous = comment.id;
      }
    }
  }
}
