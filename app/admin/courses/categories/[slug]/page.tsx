import Link from "next/link";
import { notFound } from "next/navigation";
import { ExternalLink, LibraryBig } from "lucide-react";
import { getCategoryShelf } from "@/lib/learn/categories";
import { categoryHref } from "@/lib/learn/classes";
import {
  Badge,
  Card,
  CardHeader,
  EmptyState,
  PageHeader,
} from "@/components/app/ui";
import { CategoryForm } from "@/app/admin/courses/_components/category-form";
import { DeleteCategoryButton } from "@/app/admin/courses/_components/delete-category-button";
import { ShelfClassPicker } from "@/app/admin/courses/_components/shelf-class-picker";
import { ShelfClassRow } from "@/app/admin/courses/_components/shelf-class-row";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const shelf = await getCategoryShelf(slug);
  return { title: shelf ? `${shelf.category.name} · Class categories` : "Category" };
}

/**
 * One category's shelf.
 *
 * The classes on it in the order members see them, with each one's place on
 * this shelf only (up, down, off); a checklist to add several more at once;
 * and the category's own name and description. A draft keeps its place on
 * the shelf but is hidden from members until it is published, so the list
 * says which ones those are.
 */
export default async function CourseCategoryPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const shelf = await getCategoryShelf(slug);
  if (!shelf) notFound();

  const { category, classes, candidates } = shelf;
  const visible = category.publishedCount > 0;

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        back={{ href: "/admin/courses/categories", label: "Class categories" }}
        eyebrow="Category"
        title={category.name}
        description={
          <span className="flex flex-wrap items-center gap-x-2.5 gap-y-1">
            {visible ? (
              <Badge tone="success">In the library</Badge>
            ) : (
              <Badge tone="neutral">Hidden from members</Badge>
            )}
            <span className="tabular-nums">
              {category.classCount} {category.classCount === 1 ? "class" : "classes"} ·{" "}
              {category.publishedCount} published
            </span>
            {visible ? (
              <Link
                href={categoryHref(category.slug)}
                className="inline-flex items-center gap-1 font-medium text-link no-underline transition hover:underline"
              >
                View as a member
                <ExternalLink className="size-3.5" aria-hidden />
              </Link>
            ) : null}
          </span>
        }
        actions={<DeleteCategoryButton category={category} />}
      />

      <div className="grid grid-cols-1 gap-6 xl:grid-cols-[minmax(0,1fr)_22rem]">
        <div className="flex min-w-0 flex-col gap-6">
          <Card padding="none" className="overflow-hidden">
            <CardHeader
              title="Classes on this shelf"
              count={classes.length}
              description="Top to bottom is left to right in the library."
            />
            {classes.length === 0 ? (
              <EmptyState
                size="sm"
                bordered={false}
                icon={<LibraryBig />}
                title="Nothing on this shelf yet"
                description="Add classes below. Until one of them is published, members do not see this shelf."
              />
            ) : (
              <ol className="divide-y divide-separator">
                {classes.map((cls, index) => (
                  <ShelfClassRow
                    key={cls.id}
                    categoryId={category.id}
                    categoryName={category.name}
                    position={index + 1}
                    isFirst={index === 0}
                    isLast={index === classes.length - 1}
                    cls={cls}
                  />
                ))}
              </ol>
            )}
          </Card>

          <Card padding="none">
            <CardHeader
              title="Add classes"
              description="Ticked classes join the end of the shelf, in the order listed."
            />
            <div className="px-4 py-4 sm:px-5">
              <ShelfClassPicker
                categoryId={category.id}
                candidates={candidates.map(({ id, title, published }) => ({
                  id,
                  title,
                  published,
                }))}
              />
            </div>
          </Card>
        </div>

        <aside className="min-w-0 self-start">
          <Card padding="none">
            <CardHeader
              title="Details"
              description="Renaming keeps the shelf's address, so links to it still work."
            />
            <div className="px-4 py-4 sm:px-5">
              <CategoryForm
                category={{
                  id: category.id,
                  name: category.name,
                  description: category.description,
                }}
              />
            </div>
          </Card>
        </aside>
      </div>
    </div>
  );
}
