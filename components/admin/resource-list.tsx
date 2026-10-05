"use client";

import { useId, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { AlertCircle, FileText, Link2, Paperclip, Subtitles, Trash2 } from "lucide-react";
import {
  createResourceAction,
  deleteResourceAction,
} from "@/app/admin/courses/curriculum-actions";
import { MediaField } from "@/components/admin/media-field";
import { Badge, Button, EmptyState, Field, Input, Select } from "@/components/app/ui";
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
  const fieldId = useId();
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

  const attachButton = (
    <Button size="sm" onClick={() => setAdding(true)}>
      <Paperclip className="size-4" aria-hidden />
      Attach a file
    </Button>
  );

  return (
    <div className={cn("flex min-w-0 flex-col", compact ? "gap-2" : "gap-3")}>
      {resources.length > 0 ? (
        <ul className="divide-y divide-separator">
          {resources.map((resource) => {
            const Icon = KIND_ICON[resource.kind] ?? FileText;
            return (
              <li
                key={resource.id}
                className={cn("flex min-w-0 items-center gap-2.5", compact ? "py-1.5" : "py-2")}
              >
                <Icon className="size-4 shrink-0 text-foreground-muted" aria-hidden />
                <span className="min-w-0 flex-1 truncate text-label text-foreground">
                  {resource.title}
                </span>
                {resource.kind === "captions" ? <Badge tone="info">Captions</Badge> : null}
                <Button
                  variant="ghost"
                  size="sm"
                  iconOnly
                  onClick={() => remove(resource.id)}
                  disabled={pending}
                  aria-label={`Remove ${resource.title}`}
                  title={`Remove ${resource.title}`}
                  className="-mr-1.5 [&:hover:not(:disabled)_svg]:text-danger"
                >
                  <Trash2 className="size-4" aria-hidden />
                </Button>
              </li>
            );
          })}
        </ul>
      ) : compact || adding ? null : (
        <EmptyState
          icon={<Paperclip />}
          title="Nothing attached yet."
          size="sm"
          bordered={false}
          className="py-6"
          action={attachButton}
        />
      )}

      {error ? (
        <p role="alert" className="flex items-start gap-1.5 text-caption font-medium text-danger">
          <AlertCircle className="mt-px size-3.5 shrink-0" aria-hidden />
          {error}
        </p>
      ) : null}

      {adding ? (
        <form
          onSubmit={add}
          className={cn(
            "flex flex-col gap-4",
            compact ? "pt-1" : "rounded-ctl bg-surface-muted p-3 sm:p-4",
          )}
        >
          <Field label="Title" htmlFor={`${fieldId}-title`}>
            <Input
              id={`${fieldId}-title`}
              name="title"
              required
              maxLength={160}
              placeholder="What it is called"
            />
          </Field>
          <MediaField
            name="url"
            label="File or link"
            value={null}
            accept={IMAGE_ACCEPT}
            maxBytes={IMAGE_MAX_BYTES}
            uploadsEnabled={uploadsEnabled}
            help="Images upload here. A PDF, a spreadsheet or a caption track has to be a link."
          />
          <div className="flex flex-wrap items-end gap-x-2 gap-y-3">
            <Field label="Kind" htmlFor={`${fieldId}-kind`} className="w-full max-w-44">
              <Select id={`${fieldId}-kind`} name="kind">
                <option value="file">File</option>
                <option value="link">Link</option>
                <option value="captions">Captions (.vtt)</option>
              </Select>
            </Field>
            <div className="ml-auto flex items-center gap-2">
              <Button variant="ghost" size="sm" onClick={() => setAdding(false)}>
                Cancel
              </Button>
              <Button type="submit" variant="primary" size="sm">
                Attach
              </Button>
            </div>
          </div>
        </form>
      ) : resources.length > 0 || compact ? (
        <div>{attachButton}</div>
      ) : null}
    </div>
  );
}
