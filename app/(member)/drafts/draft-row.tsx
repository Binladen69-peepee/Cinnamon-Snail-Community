"use client";

import { useTransition } from "react";
import { Loader2, Send, Trash2 } from "lucide-react";
import {
  deletePostAction,
  publishPostAction,
} from "@/app/(member)/community-actions";
import { toast } from "@/components/ui/toast";

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
    <li className="rounded-card border border-border bg-surface p-4">
      <p className="text-[12px] font-semibold uppercase tracking-[0.12em] text-foreground-muted">
        {post.spaceName}
      </p>
      {post.title ? (
        <h2 className="mt-1.5 text-[15.5px] font-bold text-foreground">
          {post.title}
        </h2>
      ) : null}
      <p className="mt-1 line-clamp-3 text-[14px] leading-relaxed text-foreground-muted">
        {post.plainText || "No text yet."}
      </p>

      <p className="mt-2 text-[12.5px] text-foreground-muted">
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

      <div className="mt-3 flex flex-wrap items-center gap-2 border-t border-border pt-3">
        {canPublish ? (
          <button
            type="button"
            disabled={pending}
            onClick={() => run(publishPostAction, "Published.")}
            className="vu-btn vu-btn-primary inline-flex h-11 items-center gap-1.5 px-4 text-[13.5px]"
          >
            {pending ? (
              <Loader2 className="size-4 animate-spin" aria-hidden />
            ) : (
              <Send className="size-4" aria-hidden />
            )}
            Publish now
          </button>
        ) : (
          <p className="text-[13px] text-foreground-muted">
            Waiting for a host to review it.
          </p>
        )}
        <button
          type="button"
          disabled={pending}
          onClick={() => run(deletePostAction, "Deleted.")}
          className="vu-btn inline-flex h-11 items-center gap-1.5 px-4 text-[13.5px] text-danger"
        >
          <Trash2 className="size-4" aria-hidden />
          Delete
        </button>
      </div>
    </li>
  );
}
