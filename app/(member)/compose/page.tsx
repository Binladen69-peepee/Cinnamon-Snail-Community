import { PostType } from "@prisma/client";
import { auth } from "@/auth";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/db";
import { createPostAction } from "@/app/(member)/community-actions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { EmptyState } from "@/components/ui/empty-state";

const TYPES = Object.values(PostType);

export default async function ComposePage({
  searchParams,
}: {
  searchParams: Promise<{ type?: string }>;
}) {
  const session = await auth();
  if (!session?.user.id) redirect("/login");
  const requested = (await searchParams).type;
  const defaultType = TYPES.includes(requested as PostType)
    ? (requested as PostType)
    : "SIMPLE";
  const spaces = await prisma.space.findMany({
    where: { memberships: { some: { userId: session.user.id } } },
    orderBy: { sortOrder: "asc" },
  });

  if (spaces.length === 0) {
    return (
      <EmptyState
        title="No kitchen is open to you yet"
        body="You need a space membership before you can post. Ask a host, or return home and try again after you have been seated."
        actionLabel="Back to home"
        actionHref="/home"
      />
    );
  }

  return (
    <div className="mx-auto max-w-2xl">
      <h1 className="font-display text-4xl text-forest">Share with the table</h1>
      <p className="mt-3 text-muted">
        Write in Markdown. Mention people with @handle. Add a photo, a GIF URL,
        a link, or a poll.
      </p>
      <form action={createPostAction} className="mt-8 space-y-4">
        <label className="block text-sm font-medium">
          Space
          <select
            name="spaceId"
            required
            className="mt-2 min-h-11 w-full rounded-2xl border border-sand bg-warm-white px-4"
          >
            {spaces.map((space) => (
              <option key={space.id} value={space.id}>
                {space.name}
              </option>
            ))}
          </select>
        </label>
        <label className="block text-sm font-medium">
          Type
          <select
            name="type"
            className="mt-2 min-h-11 w-full rounded-2xl border border-sand bg-warm-white px-4"
            defaultValue={defaultType}
          >
            <option value="SIMPLE">Simple</option>
            <option value="ARTICLE">Article</option>
            <option value="QUESTION">Question</option>
            <option value="POLL">Poll</option>
            <option value="LINK">Link</option>
            <option value="IMAGE">Image</option>
            <option value="VIDEO">Video</option>
            <option value="RECIPE">Recipe</option>
            <option value="EVENT">Event</option>
          </select>
        </label>
        <Input name="title" placeholder="Title (optional)" />
        <Textarea name="body" required placeholder="What’s cooking?" />
        <Input name="linkUrl" placeholder="Link URL (optional)" />
        <Input name="imageUrl" placeholder="Image URL (optional)" />
        <Input name="gifUrl" placeholder="GIF URL (optional)" />
        <div className="grid gap-2 md:grid-cols-2">
          <Input name="poll1" placeholder="Poll option 1" />
          <Input name="poll2" placeholder="Poll option 2" />
          <Input name="poll3" placeholder="Poll option 3" />
          <Input name="poll4" placeholder="Poll option 4" />
        </div>
        <label className="block text-sm">
          Schedule (optional)
          <Input className="mt-2" type="datetime-local" name="scheduledAt" />
        </label>
        <div className="flex gap-3">
          <Button type="submit" name="status" value="PUBLISHED">
            Publish
          </Button>
          <Button type="submit" name="status" value="DRAFT" variant="secondary">
            Save draft
          </Button>
        </div>
      </form>
    </div>
  );
}
