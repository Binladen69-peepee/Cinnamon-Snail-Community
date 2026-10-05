import Link from "next/link";
import { Shuffle } from "lucide-react";
import { listPendingVariations } from "@/lib/recipes/variations";
import { Badge, EmptyPanel, PageHeader, Panel, PanelHeader } from "@/components/admin/ui";
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
    <div className="space-y-5 py-2">
      <PageHeader
        title="Recipe variations"
        subtitle="Members' takes on existing recipes. Nothing is listed until you publish it."
      />

      <Panel>
        <PanelHeader
          title="Waiting for review"
          icon={<Shuffle className="size-3.5" aria-hidden />}
          count={pending.length}
        />
        {pending.length === 0 ? (
          <EmptyPanel
            icon={<Shuffle className="size-6" aria-hidden />}
            title="Nothing waiting"
            body="When a member shares their version of a recipe, it arrives here for a read before it goes up."
          />
        ) : (
          <ul className="divide-y divide-separator">
            {pending.map((variation) => (
              <li key={variation.id} className="space-y-2 px-4 py-4">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="text-[13px] font-bold text-foreground">
                    {variation.recipePostId ? (
                      <Link href={`/posts/${variation.recipePostId}`} className="no-underline hover:underline">
                        {variation.recipeTitle}
                      </Link>
                    ) : (
                      variation.recipeTitle
                    )}
                  </span>
                  <span className="text-[12px] text-foreground-muted">
                    by @{variation.author.handle}
                  </span>
                  <span className="text-[11.5px] tabular-nums text-foreground-muted">
                    {variation.createdAt.toLocaleDateString()}
                  </span>
                </div>

                <p className="text-[13.5px] leading-snug text-foreground">{variation.authorNote}</p>
                {variation.reason ? (
                  <p className="text-[12.5px] text-foreground-muted">Why: {variation.reason}</p>
                ) : null}
                {variation.ingredients.length > 0 ? (
                  <ul className="list-inside list-disc text-[12.5px] text-foreground-muted">
                    {variation.ingredients.map((item) => (
                      <li key={item}>{item}</li>
                    ))}
                  </ul>
                ) : null}

                {variation.veganFlags.length > 0 ? (
                  <ul className="space-y-0.5">
                    {variation.veganFlags.map((flag) => (
                      <li key={flag.term} className="text-[12px] text-warning">
                        Check: {flag.note}
                      </li>
                    ))}
                  </ul>
                ) : (
                  <Badge tone="good">Vegan check clean</Badge>
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
      </Panel>
    </div>
  );
}
