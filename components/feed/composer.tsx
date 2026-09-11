"use client";

import Link from "next/link";
import { useRef, useState, useTransition } from "react";
import { CalendarDays, ImagePlus, Link2, ListChecks, Loader2 } from "lucide-react";
import { createPostAction } from "@/app/(member)/community-actions";
import { Avatar } from "@/components/ui/avatar";
import { UploadTray } from "@/components/feed/upload-tray";
import { useUploads } from "@/components/feed/use-uploads";
import { ACCEPT } from "@/lib/uploads/policy";
import { cn } from "@/lib/utils";

export type ComposerSpace = { id: string; name: string; slug: string };

const MAX = 5000;

/**
 * The composer.
 *
 * Collapsed it is one line, so it never pushes the first post below the fold.
 * Focused it grows and shows where the post will land plus the attachment
 * controls. Posting does not navigate: the box clears and the list revalidates
 * underneath, so you keep your place.
 *
 * A title field appears only once there is something to title. Reddit makes the
 * title mandatory and the body optional; here it is the reverse, because most
 * posts in this community are a photo and a sentence rather than an article.
 */
export function Composer({
  name,
  avatar,
  spaces,
  defaultSpaceId,
  uploadsEnabled = false,
}: {
  name: string;
  avatar: string | null;
  spaces: ComposerSpace[];
  defaultSpaceId?: string;
  uploadsEnabled?: boolean;
}) {
  const [body, setBody] = useState("");
  const [title, setTitle] = useState("");
  const [spaceId, setSpaceId] = useState(defaultSpaceId ?? spaces[0]?.id ?? "");
  const [open, setOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const boxRef = useRef<HTMLTextAreaElement>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const uploads = useUploads();

  const text = body.trim();
  const heading = title.trim();
  const hasContent = text.length > 0 || heading.length > 0 || uploads.attachments.length > 0;
  const canPost =
    hasContent && text.length <= MAX && Boolean(spaceId) && !pending && !uploads.busy;

  function submit() {
    if (!canPost) return;
    const data = new FormData();
    data.set("body", text);
    data.set("title", heading);
    data.set("spaceId", spaceId);
    if (uploads.attachments.length > 0) {
      data.set("attachments", JSON.stringify(uploads.attachments));
    }

    startTransition(async () => {
      const result = await createPostAction(data);
      if (result.ok) {
        setBody("");
        setTitle("");
        setError(null);
        setOpen(false);
        uploads.reset();
        if (boxRef.current) boxRef.current.style.height = "auto";
      } else {
        setError(result.error);
      }
    });
  }

  function grow(el: HTMLTextAreaElement) {
    el.style.height = "auto";
    el.style.height = `${Math.min(el.scrollHeight, 320)}px`;
  }

  if (spaces.length === 0) {
    return (
      <div className="rounded-card border border-border bg-surface px-4 py-3 text-[14px] text-foreground-muted">
        You need a space membership before you can post. Ask a host to seat you
        at a table.
      </div>
    );
  }

  return (
    <section
      className={cn(
        "rounded-card border bg-surface transition-colors",
        open ? "border-brand/50" : "border-border",
      )}
    >
      <div className="flex gap-2.5 p-2.5">
        <Avatar name={name} src={avatar} size="sm" />

        <div className="min-w-0 flex-1">
          {open ? (
            <input
              value={title}
              onChange={(event) => setTitle(event.currentTarget.value)}
              placeholder="Title (optional)"
              aria-label="Post title"
              maxLength={300}
              className="mb-1.5 w-full border-0 bg-transparent p-0 text-[15.5px] font-bold text-foreground outline-none placeholder:font-semibold placeholder:text-foreground-muted"
            />
          ) : null}

          <textarea
            ref={boxRef}
            value={body}
            rows={1}
            disabled={pending}
            aria-label="Write a post"
            placeholder="Share a plate, a question, or what went wrong…"
            onFocus={() => setOpen(true)}
            onChange={(event) => {
              setBody(event.currentTarget.value);
              grow(event.currentTarget);
            }}
            onKeyDown={(event) => {
              if ((event.metaKey || event.ctrlKey) && event.key === "Enter") {
                event.preventDefault();
                submit();
              }
            }}
            className="w-full resize-none border-0 bg-transparent p-0 pt-1 text-[15px] leading-normal text-foreground outline-none placeholder:text-foreground-muted disabled:opacity-60"
          />

          <UploadTray
            items={uploads.items}
            onRemove={uploads.remove}
            onRetry={uploads.retry}
            onAlt={uploads.setAlt}
          />

          {error ? (
            <p className="mt-2 text-[12.5px] font-semibold text-danger" role="alert">
              {error}
            </p>
          ) : null}

          {open ? (
            <>
              {spaces.length > 1 ? (
                <div className="mt-2.5 flex flex-wrap items-center gap-1">
                  <span className="mr-0.5 text-[10.5px] font-bold uppercase tracking-[0.12em] text-foreground-muted">
                    Post to
                  </span>
                  {spaces.map((space) => (
                    <button
                      key={space.id}
                      type="button"
                      onClick={() => setSpaceId(space.id)}
                      aria-pressed={spaceId === space.id}
                      className={cn(
                        "inline-flex h-6.5 items-center rounded-full px-2 text-[12px] font-bold transition",
                        spaceId === space.id
                          ? "bg-brand-wash text-brand ring-1 ring-brand/30"
                          : "text-foreground-muted hover:bg-mint hover:text-foreground",
                      )}
                    >
                      {space.name}
                    </button>
                  ))}
                </div>
              ) : null}

              <div className="mt-2.5 flex items-center gap-0.5 border-t border-border pt-2">
                <input
                  ref={fileRef}
                  type="file"
                  accept={ACCEPT}
                  multiple
                  className="hidden"
                  onChange={(event) => {
                    const picked = event.currentTarget.files;
                    if (picked?.length) uploads.add(picked);
                    // Reset so picking the same file twice still fires.
                    event.currentTarget.value = "";
                  }}
                />
                <Tool
                  icon={ImagePlus}
                  label="Photo"
                  disabled={!uploadsEnabled}
                  title={
                    uploadsEnabled
                      ? "Add photos or video"
                      : "Uploads are not configured on this environment yet"
                  }
                  onClick={() => fileRef.current?.click()}
                />
                {/* Polls, events and links need structured fields, which belong
                    on the full editor rather than crammed in here. */}
                <ToolLink href="/compose?type=POLL" icon={ListChecks} label="Poll" />
                <ToolLink href="/compose?type=EVENT" icon={CalendarDays} label="Event" />
                <ToolLink href="/compose?type=LINK" icon={Link2} label="Link" />

                <span className="flex-1" />

                {uploads.busy ? (
                  <span className="mr-2 text-[11.5px] font-bold text-foreground-muted">
                    Uploading…
                  </span>
                ) : null}

                {text.length > MAX - 500 ? (
                  <span
                    className={cn(
                      "mr-2 text-[11.5px] font-bold tabular-nums",
                      text.length > MAX ? "text-danger" : "text-foreground-muted",
                    )}
                  >
                    {MAX - text.length}
                  </span>
                ) : null}

                <button
                  type="button"
                  onClick={submit}
                  disabled={!canPost}
                  className={cn(
                    "inline-flex h-8 min-w-18 items-center justify-center gap-1.5 rounded-full px-3.5",
                    "text-[13px] font-bold transition active:scale-[0.97]",
                    "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand",
                    "bg-forest text-paper hover:bg-deep-forest",
                    "disabled:cursor-not-allowed disabled:opacity-40 disabled:active:scale-100",
                    "dark:bg-brand dark:text-on-brand dark:hover:bg-brand-strong",
                  )}
                >
                  {pending ? (
                    <>
                      <Loader2 className="size-3.5 animate-spin" aria-hidden />
                      Posting
                    </>
                  ) : (
                    "Post"
                  )}
                </button>
              </div>
            </>
          ) : null}
        </div>
      </div>
    </section>
  );
}

function Tool({
  icon: Icon,
  label,
  onClick,
  disabled,
  title,
}: {
  icon: typeof ImagePlus;
  label: string;
  onClick?: () => void;
  disabled?: boolean;
  title?: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      title={title ?? label}
      className="inline-flex h-8 items-center gap-1.5 rounded-chip px-2 text-[12.5px] font-bold text-foreground-muted transition hover:bg-mint hover:text-foreground disabled:cursor-not-allowed disabled:opacity-40 disabled:hover:bg-transparent"
    >
      <Icon className="size-4 text-brand" aria-hidden />
      <span className="hidden sm:inline">{label}</span>
    </button>
  );
}

function ToolLink({
  href,
  icon: Icon,
  label,
}: {
  href: string;
  icon: typeof ImagePlus;
  label: string;
}) {
  return (
    <Link
      href={href}
      title={label}
      className="inline-flex h-8 items-center gap-1.5 rounded-chip px-2 text-[12.5px] font-bold text-foreground-muted no-underline transition hover:bg-mint hover:text-foreground"
    >
      <Icon className="size-4 text-brand" aria-hidden />
      <span className="hidden sm:inline">{label}</span>
    </Link>
  );
}
