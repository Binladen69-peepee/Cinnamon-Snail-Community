import { notFound, redirect } from "next/navigation";
import { auth } from "@/auth";
import { AppShell } from "@/components/app/app-shell";
import { Callout, Card, PageHeader } from "@/components/app/ui";
import { IdeaForm } from "@/components/ideas/idea-form";
import { IDEAS_TITLE } from "@/lib/ideas/constants";
import { getIdeaDetail } from "@/lib/ideas/queries";

export const dynamic = "force-dynamic";
export const metadata = { title: `Edit idea · ${IDEAS_TITLE}` };

/**
 * Fixing an idea's wording. Its author may while it is open (once the team
 * has picked it up, what people voted for stays put); staff always may, and
 * the edit is recorded in the audit log either way.
 */
export default async function EditIdeaPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const session = await auth();
  if (!session?.user.id) {
    redirect(`/login?callbackUrl=${encodeURIComponent(`/ideas/${id}/edit`)}`);
  }

  const idea = await getIdeaDetail(session.user.id, id);
  if (!idea) notFound();
  if (!idea.canEdit) redirect(`/ideas/${id}`);

  return (
    <AppShell>
      <div className="flex flex-col gap-6">
        <PageHeader
          back={{ href: `/ideas/${id}`, label: "Back to the idea" }}
          title={idea.isAuthor ? "Edit your idea" : "Edit this idea"}
          description="Fix the wording, the kind or the details. Votes and replies stay as they are."
        />
        {!idea.isAuthor ? (
          <Callout tone="info">
            You are editing {idea.author.name}’s idea as a member of the team. The change is
            recorded.
          </Callout>
        ) : null}
        <Card padding="lg">
          <IdeaForm
            mode="edit"
            ideaId={idea.id}
            initial={{ title: idea.title, body: idea.body, category: idea.category }}
            cancelHref={`/ideas/${id}`}
          />
        </Card>
      </div>
    </AppShell>
  );
}
