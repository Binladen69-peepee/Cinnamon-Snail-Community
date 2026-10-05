"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { AlertCircle, Loader2 } from "lucide-react";
import { setCoursePublishedAction } from "@/app/admin/courses/actions";
import { Button } from "@/components/app/ui";

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
    <div className="flex flex-wrap items-center gap-2 sm:justify-end">
      {error ? (
        <p
          role="alert"
          className="flex basis-full items-center gap-1.5 text-label font-medium text-danger sm:justify-end"
        >
          <AlertCircle className="size-4 shrink-0" aria-hidden />
          {error}
        </p>
      ) : null}
      <Button onClick={() => router.push("/admin/courses")}>Done</Button>
      <Button
        onClick={toggle}
        disabled={pending}
        aria-busy={pending || undefined}
        variant="primary"
      >
        {pending ? <Loader2 className="size-4 animate-spin" aria-hidden /> : null}
        {pending ? "Saving…" : published ? "Unpublish" : "Publish"}
      </Button>
    </div>
  );
}
