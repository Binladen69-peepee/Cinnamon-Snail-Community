import { prisma } from "@/lib/db";

export type MomentumStat = {
  value: string;
  label: string;
  placeholder: boolean;
  detail: string;
};

const unavailableMomentum: MomentumStat[] = [
  {
    value: "—",
    label: "Members at the table",
    placeholder: false,
    detail: "People with names, cities, and a seat.",
  },
  {
    value: "—",
    label: "Courses in the catalog",
    placeholder: true,
    detail: "Lessons that end in dinner, once playback ships.",
  },
  {
    value: "—",
    label: "Recipes shared",
    placeholder: false,
    detail: "Plates and questions posted at Kitchen Table.",
  },
  {
    value: "—",
    label: "Live events & workshops",
    placeholder: true,
    detail: "Calendar listings arrive with hosted sessions.",
  },
];

export async function getHomepageMomentum(): Promise<MomentumStat[]> {
  if (!process.env.DATABASE_URL) return unavailableMomentum;

  try {
    const [members, posts, recipes, publishedCourses, events] = await Promise.all([
      prisma.user.count({
        where: { deletedAt: null, status: { not: "DELETED" } },
      }),
      prisma.post.count({ where: { status: "PUBLISHED" } }),
      prisma.recipe.count(),
      prisma.course.count({ where: { published: true } }),
      prisma.event.count(),
    ]);

    return [
      {
        value: String(members),
        label: "Members at the table",
        placeholder: false,
        detail: "People with names, cities, and a seat.",
      },
      {
        value: publishedCourses > 0 ? String(publishedCourses) : "—",
        label: "Courses in the catalog",
        placeholder: publishedCourses === 0,
        detail: "Lessons that end in dinner.",
      },
      {
        value: recipes > 0 ? String(recipes) : String(posts),
        label: recipes > 0 ? "Recipes & resources" : "Plates and questions posted",
        placeholder: false,
        detail: "What the table is actually cooking and asking.",
      },
      {
        value: events > 0 ? String(events) : "—",
        label: "Live events & workshops",
        placeholder: events === 0,
        detail: "Hosted sessions on the campus calendar.",
      },
    ];
  } catch {
    return unavailableMomentum;
  }
}

export async function getPublishedCoursePreview() {
  if (!process.env.DATABASE_URL) return [];

  try {
    return await prisma.course.findMany({
      where: { published: true },
      orderBy: { createdAt: "desc" },
      take: 4,
      select: {
        slug: true,
        title: true,
        description: true,
        coverUrl: true,
        instructorName: true,
      },
    });
  } catch {
    return [];
  }
}
