import { redirect } from "next/navigation";
import { auth } from "@/auth";
import { AppShell } from "@/components/app/app-shell";
import { Card, PageHeader } from "@/components/app/ui";
import { IdeaForm } from "@/components/ideas/idea-form";
import { IDEAS_TITLE, IDEA_TITLE_MAX, parseIdeaCategory } from "@/lib/ideas/constants";

export const dynamic = "force-dynamic";
export const metadata = { title: `Share an idea · ${IDEAS_TITLE}` };

/**
 * Sharing an idea. The form looks for the same request while the title is
 * typed, so the member can add a vote to an existing idea instead of
 * starting a second copy of it.
 *
 * `?category=recipe` and `?title=…` prefill the form, for links elsewhere in
 * the app that say "ask for it".
 */
export default async function NewIdeaPage({
  searchParams,
}: {
  searchParams: Promise<{ category?: string; title?: string }>;
}) {
  const session = await auth();
  if (!session?.user.id) redirect("/login?callbackUrl=/ideas/new");

  const params = await searchParams;
  const category = parseIdeaCategory(params.category);
  const title = typeof params.title === "string" ? params.title.slice(0, IDEA_TITLE_MAX) : "";

  return (
    <AppShell>
      <div className="flex flex-col gap-6">
        <PageHeader
          back={{ href: "/ideas", label: IDEAS_TITLE }}
          title="Share an idea"
          description="Ask for a class, a recipe or a feature. If someone has asked already, add your vote to theirs instead: one idea with many votes counts for more than many with one."
        />
        <Card padding="lg">
          <IdeaForm mode="create" initial={{ title, body: "", category }} cancelHref="/ideas" />
        </Card>
      </div>
    </AppShell>
  );
}
