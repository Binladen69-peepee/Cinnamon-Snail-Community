"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { FileText, Link2, Paperclip, Subtitles, Trash2 } from "lucide-react";
import {
  createResourceAction,
  deleteResourceAction,
} from "@/app/admin/courses/curriculum-actions";
import { MediaField } from "@/components/admin/media-field";
import { IMAGE_ACCEPT, IMAGE_MAX_BYTES } from "@/lib/uploads/policy";
import { cn } from "@/lib/utils";

export type ResourceRow = {
  id: string;
  title: string;
  url: string;
  kind: string;
};

const KIND_ICON: Record<string, typeof FileText> = {
  file: Paperclip,
  captions: Subtitles,
  link: Link2,
};

/**
 * Handouts, caption tracks and links, for a course or for one lesson.
 *
 * The same list in both places because they are the same row with a different
 * parent, and a second component would be a second set of bugs. Captions are
 * called out by name rather than left as "a file" because the player picks the
 * first one up automatically, and an admin attaching a `.vtt` as an ordinary
 * file would never find out why subtitles did not appear.
 */
export function ResourceList({
  slug,
  lessonId,
  resources,
  uploadsEnabled,
  compact = false,
}: {
  slug: string;
  /** Null for a course-level resource. */
  lessonId?: string;
  resources: ResourceRow[];
  uploadsEnabled: boolean;
  compact?: boolean;
}) {
  const router = useRouter();
  const [adding, setAdding] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  async function add(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget;
    const data = new FormData(form);
    data.set("slug", slug);
    if (lessonId) data.set("lessonId", lessonId);
    setError(null);
    const result = await createResourceAction(data);
    if (result.ok) {
      form.reset();
      setAdding(false);
      router.refresh();
    } else {
      setError(result.error);
    }
  }

  function remove(id: string) {
    const data = new FormData();
    data.set("resourceId", id);
    data.set("slug", slug);
    startTransition(async () => {
      const result = await deleteResourceAction(data);
      if (result.ok) router.refresh();
      else setError(result.error);
    });
  }

  return (
    <div className={cn("min-w-0", compact ? "space-y-1.5" : "space-y-2")}>
      {resources.length > 0 ? (
        <ul className="space-y-1">
          {resources.map((resource) => {
            const Icon = KIND_ICON[resource.kind] ?? FileText;
            return (
              <li
                key={resource.id}
                className="flex items-center gap-2 rounded-ctl border border-border bg-background px-2.5 py-1.5"
              >
                <Icon
                  className="size-3.5 shrink-0 text-foreground-muted"
                  aria-hidden
                />
                <span className="min-w-0 flex-1 truncate text-[12.5px] text-foreground">
                  {resource.title}
                </span>
                {resource.kind === "captions" ? (
                  <span className="shrink-0 rounded-chip border border-border px-1.5 py-0.5 text-[10.5px] font-bold text-foreground-muted">
                    Captions
                  </span>
                ) : null}
                <button
                  type="button"
                  onClick={() => remove(resource.id)}
                  disabled={pending}
                  aria-label={`Remove ${resource.title}`}
                  className="grid size-6 shrink-0 place-items-center rounded-ctl text-foreground-muted transition hover:bg-mint hover:text-danger"
                >
                  <Trash2 className="size-3.5" aria-hidden />
                </button>
              </li>
            );
          })}
        </ul>
      ) : compact ? null : (
        <p className="text-[12.5px] text-foreground-muted">
          Nothing attached yet.
        </p>
      )}

      {error ? (
        <p role="alert" className="text-[12px] font-semibold text-danger">
          {error}
        </p>
      ) : null}

      {adding ? (
        <form
          onSubmit={add}
          className="space-y-2.5 rounded-ctl border border-border bg-surface p-3"
        >
          <input
            name="title"
            required
            maxLength={160}
            placeholder="What it is called"
            className={INPUT}
          />
          <MediaField
            name="url"
            label="File or link"
            value={null}
            accept={IMAGE_ACCEPT}
            maxBytes={IMAGE_MAX_BYTES}
            uploadsEnabled={uploadsEnabled}
            help="Images upload here. A PDF, a spreadsheet or a caption track has to be a link."
          />
          <div className="flex flex-wrap items-center gap-2">
            <select name="kind" className={cn(INPUT, "max-w-[11rem]")}>
              <option value="file">File</option>
              <option value="link">Link</option>
              <option value="captions">Captions (.vtt)</option>
            </select>
            <div className="ml-auto flex items-center gap-2">
              <button
                type="button"
                onClick={() => setAdding(false)}
                className="h-8 rounded-ctl border border-border bg-background px-3 text-[12.5px] font-semibold text-foreground transition hover:border-hairline-firm"
              >
                Cancel
              </button>
              <button
                type="submit"
                className="h-8 rounded-ctl bg-brand-fill px-3 text-[12.5px] font-semibold text-brand-fill-foreground transition hover:bg-brand-fill-hover"
              >
                Attach
              </button>
            </div>
          </div>
        </form>
      ) : (
        <button
          type="button"
          onClick={() => setAdding(true)}
          className="inline-flex h-8 items-center gap-1.5 rounded-ctl border border-border bg-background px-3 text-[12.5px] font-semibold text-foreground transition hover:border-hairline-firm"
        >
          <Paperclip className="size-3.5" aria-hidden />
          Attach a file
        </button>
      )}
    </div>
  );
}

const INPUT =
  "h-9 w-full rounded-ctl border border-field-border bg-field-background px-3 text-[13px] text-foreground outline-none transition placeholder:text-field-placeholder focus:border-brand focus:ring-2 focus:ring-brand/25";
