import { PrismaClient } from "@prisma/client";
import bcrypt from "bcryptjs";
import { renderMarkdown, toPlainText } from "../lib/markdown";
import { seedTestFeed } from "./seed-test-feed";
import { seedCampusLearning } from "./seed-learn";
import { seedSocial } from "./seed-social";
import { seedCourseCatalog } from "./seed-catalog";
import { SEEDED_MEMBER_AVATARS } from "../lib/community/member-avatars";

const prisma = new PrismaClient();

async function applySeededAvatars() {
  const users = await prisma.user.findMany({
    where: { handle: { in: Object.keys(SEEDED_MEMBER_AVATARS) } },
    select: { id: true, handle: true },
  });
  for (const user of users) {
    const avatarUrl = SEEDED_MEMBER_AVATARS[user.handle];
    if (!avatarUrl) continue;
    await prisma.user.update({
      where: { id: user.id },
      data: { image: avatarUrl },
    });
    await prisma.profile.updateMany({
      where: { userId: user.id },
      data: { avatarUrl },
    });
  }
}

async function main() {
  const roles = ["MEMBER", "HOST", "ADMIN", "SUPER_ADMIN"] as const;
  for (const name of roles) {
    await prisma.role.upsert({ where: { name }, update: {}, create: { name } });
  }

  const membership = await prisma.product.upsert({
    where: { slug: "membership" },
    update: { kitTag: "vu-member" },
    create: {
      slug: "membership",
      name: "Vegan University Membership",
      kind: "MEMBERSHIP",
      description: "Full community and course access",
      kitTag: "vu-member",
    },
  });
  await prisma.product.upsert({
    where: { slug: "course-starter" },
    update: { kitTag: "vu-course" },
    create: {
      slug: "course-starter",
      name: "Starter Course",
      kind: "COURSE",
      description: "One-time course access",
      kitTag: "vu-course",
    },
  });
  await prisma.product.upsert({
    where: { slug: "kitchen-bundle" },
    update: { kitTag: "vu-bundle" },
    create: {
      slug: "kitchen-bundle",
      name: "Kitchen Bundle",
      kind: "BUNDLE",
      description: "Membership plus featured course",
      kitTag: "vu-bundle",
    },
  });
  await prisma.samcartProductMap.upsert({
    where: { samcartProductId: "1001" },
    update: { productId: membership.id },
    create: { productId: membership.id, samcartProductId: "1001" },
  });
  for (const samcartProductId of ["1069358", "1069354"]) {
    await prisma.samcartProductMap.upsert({
      where: { samcartProductId },
      update: { productId: membership.id },
      create: { productId: membership.id, samcartProductId },
    });
  }

  const passwordHash = await bcrypt.hash("vegan-local-dev", 12);

  const adam = await prisma.user.upsert({
    where: { email: "adam@veganuniversity.test" },
    update: { passwordHash, emailVerified: new Date(), status: "ACTIVE", name: "Adam" },
    create: {
      email: "adam@veganuniversity.test",
      emailVerified: new Date(),
      name: "Adam",
      handle: "adam",
      passwordHash,
      profile: {
        create: {
          displayName: "Adam",
          bio: "Founder, host, and someone who wants the table to feel warm.",
          city: "Los Angeles",
          region: "California",
          country: "USA",
          skillLevel: "advanced",
          cookingInterests: ["weeknight dinners", "gluten-free baking"],
          directoryVisible: true,
        },
      },
      emails: {
        create: {
          email: "adam@veganuniversity.test",
          verifiedAt: new Date(),
          isPrimary: true,
        },
      },
    },
  });

  const member = await prisma.user.upsert({
    where: { email: "member@veganuniversity.test" },
    update: { passwordHash, emailVerified: new Date(), status: "ACTIVE", name: "Sam Member" },
    create: {
      email: "member@veganuniversity.test",
      emailVerified: new Date(),
      name: "Sam Member",
      handle: "sam",
      passwordHash,
      profile: {
        create: {
          displayName: "Sam Member",
          bio: "Learning to cook plants without making it a project.",
          city: "Portland",
          region: "Oregon",
          country: "USA",
          skillLevel: "beginner",
          cookingInterests: ["soups", "batch cooking"],
          directoryVisible: true,
        },
      },
      emails: {
        create: {
          email: "member@veganuniversity.test",
          verifiedAt: new Date(),
          isPrimary: true,
        },
      },
    },
  });

  const adminRole = await prisma.role.findUniqueOrThrow({ where: { name: "ADMIN" } });
  const memberRole = await prisma.role.findUniqueOrThrow({ where: { name: "MEMBER" } });
  await prisma.userRole.upsert({
    where: { userId_roleId: { userId: adam.id, roleId: adminRole.id } },
    update: {},
    create: { userId: adam.id, roleId: adminRole.id },
  });
  await prisma.userRole.upsert({
    where: { userId_roleId: { userId: adam.id, roleId: memberRole.id } },
    update: {},
    create: { userId: adam.id, roleId: memberRole.id },
  });
  await prisma.userRole.upsert({
    where: { userId_roleId: { userId: member.id, roleId: memberRole.id } },
    update: {},
    create: { userId: member.id, roleId: memberRole.id },
  });

  for (const user of [adam, member]) {
    await prisma.entitlement.create({
      data: {
        userId: user.id,
        productId: membership.id,
        source: "MANUAL",
        status: "ACTIVE",
      },
    }).catch(() => undefined);
  }

  const space = await prisma.space.upsert({
    where: { slug: "kitchen-table" },
    update: {},
    create: {
      slug: "kitchen-table",
      name: "Kitchen Table",
      description: "The main community table — plates, questions, and celebrations.",
      coverUrl:
        "https://images.unsplash.com/photo-1512621776951-a57141f2eefd?auto=format&fit=crop&w=1400&q=80",
      icon: "🥗",
      kind: "FEED",
      visibility: "MEMBERS",
      postingPermission: "ALL_MEMBERS",
      hostUserId: adam.id,
      sortOrder: 1,
    },
  });

  await prisma.spaceMembership.upsert({
    where: { spaceId_userId: { spaceId: space.id, userId: adam.id } },
    update: {},
    create: { spaceId: space.id, userId: adam.id, role: "HOST" },
  });
  await prisma.spaceMembership.upsert({
    where: { spaceId_userId: { spaceId: space.id, userId: member.id } },
    update: {},
    create: { spaceId: space.id, userId: member.id, role: "MEMBER" },
  });

  const extraSpaces = [
    {
      slug: "course-hall",
      name: "Course Hall",
      description: "Lessons and course discussion live here once playback is ready.",
      kind: "COURSE" as const,
      sortOrder: 2,
    },
    {
      slug: "calendar-porch",
      name: "Calendar Porch",
      description: "Workshops, potlucks, and live sessions.",
      kind: "EVENTS" as const,
      sortOrder: 3,
    },
    {
      slug: "member-garden",
      name: "Member Garden",
      description: "A quieter room for introductions and people you should meet.",
      kind: "MEMBERS" as const,
      sortOrder: 4,
    },
  ];
  for (const extra of extraSpaces) {
    const created = await prisma.space.upsert({
      where: { slug: extra.slug },
      update: {},
      create: {
        ...extra,
        visibility: "MEMBERS",
        postingPermission: extra.kind === "COURSE" ? "HOSTS_ONLY" : "ALL_MEMBERS",
        hostUserId: adam.id,
        coverUrl:
          "https://images.unsplash.com/photo-1466637574441-749b8f19452f?auto=format&fit=crop&w=1400&q=80",
      },
    });
    await prisma.spaceMembership.upsert({
      where: { spaceId_userId: { spaceId: created.id, userId: adam.id } },
      update: {},
      create: { spaceId: created.id, userId: adam.id, role: "HOST" },
    });
    await prisma.spaceMembership.upsert({
      where: { spaceId_userId: { spaceId: created.id, userId: member.id } },
      update: {},
      create: { spaceId: created.id, userId: member.id, role: "MEMBER" },
    });
  }

  const everyone = await prisma.user.findMany({ select: { id: true } });
  for (const person of everyone) {
    await prisma.spaceMembership.upsert({
      where: { spaceId_userId: { spaceId: space.id, userId: person.id } },
      update: {},
      create: { spaceId: space.id, userId: person.id, role: "MEMBER" },
    });
  }

  const body =
    "Welcome to the table. Share a plate, a question, or the thing that used to feel too hard to cook. Mention @sam if you want a conversation starter.";
  const existing = await prisma.post.findFirst({
    where: { authorId: adam.id, spaceId: space.id },
  });
  if (!existing) {
    const post = await prisma.post.create({
      data: {
        spaceId: space.id,
        authorId: adam.id,
        type: "SIMPLE",
        status: "PUBLISHED",
        title: "The kitchen is open",
        body,
        bodyHtml: renderMarkdown(body),
        plainText: toPlainText(body),
        publishedAt: new Date(),
        mentions: { create: [{ handle: "sam" }] },
        attachments: {
          create: {
            kind: "image",
            url: "https://images.unsplash.com/photo-1540420773420-3366772f4999?auto=format&fit=crop&w=1400&q=80",
            alt: "A colorful vegan grain bowl",
          },
        },
      },
    });
    await prisma.searchIndex.create({
      data: {
        entityType: "post",
        entityId: post.id,
        title: "The kitchen is open",
        body: toPlainText(body),
        spaceId: space.id,
      },
    });
    await prisma.notification.create({
      data: {
        userId: member.id,
        category: "MENTIONS",
        title: "You were mentioned",
        body: "Adam mentioned you in Kitchen Table.",
        href: `/posts/${post.id}`,
      },
    });
  }

  const kitchenPost =
    existing ??
    (await prisma.post.findFirst({
      where: { authorId: adam.id, spaceId: space.id },
    }));

  const demoMembers = [
    {
      email: "jordan@veganuniversity.test",
      handle: "jordan",
      name: "Jordan",
      city: "Austin",
      bio: "Weeknight tofu and too many citrus recipes.",
    },
    {
      email: "priya@veganuniversity.test",
      handle: "priya",
      name: "Priya",
      city: "Chicago",
      bio: "Dal, bread, and the sauce question at 9pm.",
    },
    {
      email: "lee@veganuniversity.test",
      handle: "lee",
      name: "Lee",
      city: "Seattle",
      bio: "Steaming greens like it is a sport.",
    },
  ];
  const extras: { id: string }[] = [];
  for (const person of demoMembers) {
    const user = await prisma.user.upsert({
      where: { email: person.email },
      update: {},
      create: {
        email: person.email,
        emailVerified: new Date(),
        name: person.name,
        handle: person.handle,
        passwordHash,
        profile: {
          create: {
            displayName: person.name,
            bio: person.bio,
            city: person.city,
            country: "USA",
            directoryVisible: true,
          },
        },
        emails: {
          create: {
            email: person.email,
            verifiedAt: new Date(),
            isPrimary: true,
          },
        },
      },
    });
    extras.push(user);
    await prisma.userRole.upsert({
      where: { userId_roleId: { userId: user.id, roleId: memberRole.id } },
      update: {},
      create: { userId: user.id, roleId: memberRole.id },
    });
    await prisma.entitlement
      .create({
        data: {
          userId: user.id,
          productId: membership.id,
          source: "MANUAL",
          status: "ACTIVE",
        },
      })
      .catch(() => undefined);
  }

  const allSpaces = await prisma.space.findMany({ select: { id: true } });
  for (const extra of extras) {
    for (const room of allSpaces) {
      await prisma.spaceMembership.upsert({
        where: { spaceId_userId: { spaceId: room.id, userId: extra.id } },
        update: {},
        create: { spaceId: room.id, userId: extra.id, role: "MEMBER" },
      });
    }
  }

  const feedSpaces = await prisma.space.findMany({
    select: { id: true, slug: true, postingPermission: true },
  });
  await seedTestFeed(prisma, {
    hostId: adam.id,
    authors: [adam, member, ...extras],
    spaces: feedSpaces,
  });
  await seedCampusLearning(prisma, adam.id);

  const samplePosts = await prisma.post.findMany({
    where: { status: "PUBLISHED" },
    select: { id: true },
  });
  const reactors = [adam, member, ...extras];
  const sampleEmojis = ["👍", "❤️", "🤗", "😆", "😮"] as const;
  for (const [postIndex, postRow] of samplePosts.entries()) {
    for (const [personIndex, person] of reactors.entries()) {
      const emoji = sampleEmojis[(postIndex + personIndex) % sampleEmojis.length];
      await prisma.reaction.deleteMany({
        where: { userId: person.id, postId: postRow.id },
      });
      await prisma.reaction.create({
        data: { userId: person.id, postId: postRow.id, emoji },
      });
    }
  }

  if (kitchenPost) {
    const sampleComments = [
      { authorId: member.id, body: "Saving this for Sunday. The citrus on top is the whole mood." },
      { authorId: extras[0]?.id ?? member.id, body: "What vinegar did you use? I always go too shy." },
      { authorId: extras[1]?.id ?? adam.id, body: "This is the plate I want after class." },
    ];
    for (const row of sampleComments) {
      const already = await prisma.comment.findFirst({
        where: { postId: kitchenPost.id, authorId: row.authorId, body: row.body },
      });
      if (already) continue;
      await prisma.comment.create({
        data: {
          postId: kitchenPost.id,
          authorId: row.authorId,
          body: row.body,
          bodyHtml: renderMarkdown(row.body),
          plainText: toPlainText(row.body),
        },
      });
    }
  }

  await applySeededAvatars();
  await seedSocial(prisma);
  await seedCourseCatalog(prisma);

  await prisma.searchIndex.upsert({
    where: { entityType_entityId: { entityType: "member", entityId: "adam" } },
    update: {},
    create: {
      entityType: "member",
      entityId: "adam",
      title: "Adam",
      body: "Founder host Los Angeles weeknight dinners",
    },
  });
  await prisma.searchIndex.upsert({
    where: { entityType_entityId: { entityType: "member", entityId: "sam" } },
    update: {},
    create: {
      entityType: "member",
      entityId: "sam",
      title: "Sam Member",
      body: "Portland soups batch cooking beginner",
    },
  });
}

main()
  .then(async () => {
    await prisma.$disconnect();
  })
  .catch(async (error) => {
    console.error(error);
    await prisma.$disconnect();
    process.exit(1);
  });
