import Link from "next/link";
import { ExternalLink, Shapes } from "lucide-react";
import {
  listCategoriesForAdmin,
  unshelvedClassesForAdmin,
} from "@/lib/learn/categories";
import {
  ButtonLink,
  Callout,
  Card,
  CardHeader,
  EmptyState,
  PageHeader,
} from "@/components/app/ui";
import { CategoryForm } from "@/app/admin/courses/_components/category-form";
import { CategoryRow } from "@/app/admin/courses/_components/category-row";

export const metadata = { title: "Class categories" };

/**
 * The shelves of the class library (DEC-078).
 *
 * Create a category, rename it, move it up or down the library, delete it.
 * Which classes sit on a category, and in what order, is the category's own
 * page (its name links there); which categories one class sits on is the
 * course editor. Deleting a category removes the shelf and its links, never a
 * class.
 *
 * A category with nothing published on it is marked Hidden: members never see
 * an empty shelf. A published class on no shelf at all is called out at the
 * top: members only meet it in the "More classes" row at the very end of the
 * library, which is a safety net rather than a place to put anything.
 */
export default async function CourseCategoriesPage() {
  const [categories, unshelved] = await Promise.all([
    listCategoriesForAdmin(),
    unshelvedClassesForAdmin(),
  ]);
  const unshelvedPublished = unshelved.filter((cls) => cls.published);

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        back={{ href: "/admin/courses", label: "Courses" }}
        title="Class categories"
        description="The shelves of the class library, in the order members see them. A class can sit on several; a shelf with nothing published on it stays hidden."
        actions={
          <ButtonLink href="/learn">
            View the library
            <ExternalLink className="size-3.5" aria-hidden />
          </ButtonLink>
        }
      />

      {unshelvedPublished.length > 0 ? (
        <Callout
          tone="warning"
          title={`${unshelvedPublished.length} published ${unshelvedPublished.length === 1 ? "class is" : "classes are"} on no shelf`}
        >
          Members see {unshelvedPublished.length === 1 ? "it" : "them"} only under
          “More classes” at the very end of the library. Add{" "}
          {unshelvedPublished.length === 1 ? "it" : "them"} to a category:{" "}
          {unshelvedPublished.map((cls, index) => (
            <span key={cls.id}>
              {index > 0 ? ", " : null}
              <Link
                href={`/admin/courses/${cls.slug}/edit`}
                className="font-semibold text-link underline"
              >
                {cls.title}
              </Link>
            </span>
          ))}
          .
        </Callout>
      ) : null}

      <div className="grid grid-cols-1 gap-6 xl:grid-cols-[minmax(0,1fr)_22rem]">
        <div className="min-w-0">
          {categories.length === 0 ? (
            <EmptyState
              icon={<Shapes />}
              title="No categories yet"
              description="Create the first shelf (Fundamentals, Holidays, Cuisines from Around the World), then add classes to it."
            />
          ) : (
            <Card padding="none" className="overflow-hidden">
              <CardHeader
                title="Categories"
                count={categories.length}
                description="Top to bottom is the order of the shelves in the library."
              />
              <ol className="divide-y divide-separator">
                {categories.map((category, index) => (
                  <CategoryRow
                    key={category.id}
                    category={category}
                    isFirst={index === 0}
                    isLast={index === categories.length - 1}
                  />
                ))}
              </ol>
            </Card>
          )}
        </div>

        <aside className="min-w-0 self-start">
          <Card padding="none">
            <CardHeader
              title="New category"
              description="It joins the end of the library. Add classes to it from its page."
            />
            <div className="px-4 py-4 sm:px-5">
              <CategoryForm />
            </div>
          </Card>
        </aside>
      </div>
    </div>
  );
}
