import { prisma } from "@/lib/db";

export type MomentumStat = {
  value: string;
  label: string;
  placeholder: boolean;
};

export async function getHomepageMomentum(): Promise<MomentumStat[]> {
  const [members, posts, recipes, publishedCourses] = await Promise.all([
    prisma.user.count({
      where: { deletedAt: null, status: { not: "DELETED" } },
    }),
    prisma.post.count({ where: { status: "PUBLISHED" } }),
    prisma.recipe.count(),
    prisma.course.count({ where: { published: true } }),
  ]);

  return [
    {
      value: String(members),
      label: "Members at the table",
      placeholder: false,
    },
    {
      value: publishedCourses > 0 ? String(publishedCourses) : "—",
      label: "Courses in the catalog",
      placeholder: publishedCourses === 0,
    },
    {
      value: recipes > 0 ? String(recipes) : String(posts),
      label: recipes > 0 ? "Recipes shared" : "Plates and questions posted",
      placeholder: false,
    },
    {
      value: "—",
      label: "Average course rating",
      placeholder: true,
    },
  ];
}

export async function getPublishedCoursePreview() {
  return prisma.course.findMany({
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
}
