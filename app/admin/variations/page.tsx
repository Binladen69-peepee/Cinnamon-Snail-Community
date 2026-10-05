import Link from "next/link";
import { AlertTriangle, CheckCircle2, Shuffle } from "lucide-react";
import { listPendingVariations } from "@/lib/recipes/variations";
import { Badge, Card, CardHeader, EmptyState, PageHeader } from "@/components/app/ui";
import { VariationControls } from "@/components/admin/variation-queue";

export const dynamic = "force-dynamic";
export const metadata = { title: "Recipe variations" };

/**
 * The variation queue — BUILD.md §18 "Moderation".
 *
 * Nothing a member submits is visible to anyone else until it is approved
 * here. The vegan check has already refused anything containing an ingredient
 * with no vegan version; what reaches this page are the softer flags, shown
 * beside the text so a reviewer can see what the check was unsure about.
 */
export default async function AdminVariationsPage() {
  const pending = await listPendingVariations();

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title="Recipe variations"
        description="Members' takes on existing recipes. Nothing is listed until you publish it."
      />

      <Card padding="none">
        <CardHeader title="Waiting for review" icon={<Shuffle />} count={pending.length} />
        {pending.length === 0 ? (
          <EmptyState
            bordered={false}
            icon={<Shuffle />}
            title="Nothing waiting"
            description="When a member shares their version of a recipe, it arrives here for a read before it goes up."
          />
        ) : (
          <ul className="divide-y divide-separator">
            {pending.map((variation) => (
              <li key={variation.id} className="flex flex-col gap-3 px-4 py-4 sm:px-5">
                <div className="flex flex-wrap items-baseline gap-x-2 gap-y-1">
                  <span className="text-body font-semibold text-foreground">
                    {variation.recipePostId ? (
                      <Link
                        href={`/posts/${variation.recipePostId}`}
                        className="no-underline transition hover:text-brand-strong"
                      >
                        {variation.recipeTitle}
                      </Link>
                    ) : (
                      variation.recipeTitle
                    )}
                  </span>
                  <span className="text-caption text-foreground-muted">
                    by @{variation.author.handle}
                  </span>
                  <span className="text-caption tabular-nums text-foreground-muted">
                    {variation.createdAt.toLocaleDateString("en-GB", {
                      day: "numeric",
                      month: "short",
                      year: "numeric",
                    })}
                  </span>
                </div>

                <div className="flex flex-col gap-1.5">
                  <p className="text-body leading-relaxed text-foreground">{variation.authorNote}</p>
                  {variation.reason ? (
                    <p className="text-label text-foreground-muted">Why: {variation.reason}</p>
                  ) : null}
                  {variation.ingredients.length > 0 ? (
                    <ul className="list-inside list-disc text-label text-foreground-muted">
                      {variation.ingredients.map((item) => (
                        <li key={item}>{item}</li>
                      ))}
                    </ul>
                  ) : null}
                </div>

                {variation.veganFlags.length > 0 ? (
                  <ul className="flex flex-col gap-1 rounded-ctl bg-warning-wash px-3 py-2.5">
                    {variation.veganFlags.map((flag) => (
                      <li
                        key={flag.term}
                        className="flex items-start gap-1.5 text-label text-warning"
                      >
                        <AlertTriangle className="mt-0.5 size-3.5 shrink-0" aria-hidden />
                        <span>Check: {flag.note}</span>
                      </li>
                    ))}
                  </ul>
                ) : (
                  <Badge tone="success" icon={<CheckCircle2 aria-hidden />} className="w-fit">
                    Vegan check clean
                  </Badge>
                )}

                <VariationControls
                  variationId={variation.id}
                  status={variation.status}
                  featured={variation.featured}
                />
              </li>
            ))}
          </ul>
        )}
      </Card>
    </div>
  );
}
