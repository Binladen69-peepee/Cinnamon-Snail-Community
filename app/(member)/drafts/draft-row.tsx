"use client";

import { useTransition } from "react";
import { Loader2, Send, Trash2 } from "lucide-react";
import {
  deletePostAction,
  publishPostAction,
} from "@/app/(member)/community-actions";
import { toast } from "@/components/ui/toast";
import { Button } from "@/components/app/ui";

/**
 * One unpublished post, with the two things you can do to it.
 *
 * A post waiting on a host shows no publish button, because pressing it would
 * be refused — the author cannot approve their own post, which is the whole
 * point of review.
 */
export function DraftRow({
  post,
  canPublish,
}: {
  post: {
    id: string;
    title: string | null;
    plainText: string;
    spaceName: string;
    scheduledAt: string | null;
    updatedAt: string;
    attachments: number;
  };
  canPublish: boolean;
}) {
  const [pending, startTransition] = useTransition();

  function run(
    action: (data: FormData) => Promise<{ ok: true } | { ok: false; error: string }>,
    success: string,
  ) {
    const data = new FormData();
    data.set("postId", post.id);
    startTransition(async () => {
      const result = await action(data);
      if (result.ok) toast.success(success);
      else toast.danger(result.error);
    });
  }

  const when = post.scheduledAt ? new Date(post.scheduledAt) : null;

  return (
    // A row of the drafts card: the page sets the list in one surface with
    // dividers, so a row has no edge of its own.
    <li className="px-4 py-4 sm:px-5">
      <p className="text-micro font-semibold uppercase tracking-[0.08em] text-foreground-muted">
        {post.spaceName}
      </p>
      {post.title ? (
        <h2 className="mt-1.5 text-title font-semibold leading-snug text-foreground">
          {post.title}
        </h2>
      ) : null}
      <p className="mt-1 line-clamp-3 text-body leading-relaxed text-foreground-muted">
        {post.plainText || "No text yet."}
      </p>

      <p className="mt-2 text-caption text-foreground-muted">
        {when
          ? `Goes live ${when.toLocaleString(undefined, {
              dateStyle: "medium",
              timeStyle: "short",
            })}`
          : `Last edited ${new Date(post.updatedAt).toLocaleDateString(undefined, {
              dateStyle: "medium",
            })}`}
        {post.attachments > 0
          ? ` · ${post.attachments} ${post.attachments === 1 ? "attachment" : "attachments"}`
          : ""}
      </p>

      <div className="mt-3 flex flex-wrap items-center gap-2">
        {canPublish ? (
          <Button
            variant="primary"
            size="sm"
            disabled={pending}
            onClick={() => run(publishPostAction, "Published.")}
          >
            {pending ? (
              <Loader2 className="size-4 animate-spin" aria-hidden />
            ) : (
              <Send className="size-4" aria-hidden />
            )}
            Publish now
          </Button>
        ) : (
          <p className="mr-1 text-label text-foreground-muted">
            Waiting for a host to review it.
          </p>
        )}
        <Button
          variant="danger"
          size="sm"
          disabled={pending}
          onClick={() => run(deletePostAction, "Deleted.")}
        >
          <Trash2 className="size-4" aria-hidden />
          Delete
        </Button>
      </div>
    </li>
  );
}
