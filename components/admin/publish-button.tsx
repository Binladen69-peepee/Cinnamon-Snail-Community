"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { setCoursePublishedAction } from "@/app/admin/courses/actions";
import { cn } from "@/lib/utils";

/**
 * Publish and Done, from the design's header.
 *
 * Publishing puts a course in front of every member, so unpublishing one that
 * is live is confirmed first — the reverse is not, because making something
 * visible is undone by pressing the same button again.
 */
export function PublishButtons({
  slug,
  published,
  lessonCount,
}: {
  slug: string;
  published: boolean;
  lessonCount: number;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  function toggle() {
    if (published && !window.confirm("Unpublish this course? Members lose access to it.")) {
      return;
    }
    if (!published && lessonCount === 0) {
      const go = window.confirm(
        "This course has no lessons yet. Publish it anyway? Members will see the class page with its teaser and nothing to play.",
      );
      if (!go) return;
    }
    const data = new FormData();
    data.set("slug", slug);
    data.set("published", published ? "0" : "1");
    setError(null);
    startTransition(async () => {
      const result = await setCoursePublishedAction(data);
      if (result.ok) router.refresh();
      else setError(result.error);
    });
  }

  return (
    <div className="flex flex-wrap items-center justify-end gap-2">
      {error ? (
        <p role="alert" className="text-[12.5px] font-semibold text-danger">
          {error}
        </p>
      ) : null}
      <button
        type="button"
        onClick={() => router.push("/admin/courses")}
        className="h-9 rounded-ctl border border-border bg-background px-4 text-[13.5px] font-semibold text-foreground transition hover:border-hairline-firm"
      >
        Done
      </button>
      <button
        type="button"
        onClick={toggle}
        disabled={pending}
        className={cn(
          "h-9 rounded-ctl px-4 text-[13.5px] font-semibold transition",
          pending
            ? "bg-default text-foreground-muted"
            : "bg-brand-fill text-brand-fill-foreground hover:bg-brand-fill-hover",
        )}
      >
        {pending ? "Saving…" : published ? "Unpublish" : "Publish"}
      </button>
    </div>
  );
}
