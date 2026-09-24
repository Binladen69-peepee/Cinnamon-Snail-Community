"use client";

import Link from "next/link";
import { useRef, useState, useTransition } from "react";
import {
  CalendarClock,
  Ellipsis,
  ImagePlus,
  Link2,
  ListChecks,
  Loader2,
  Video,
} from "lucide-react";
import { createPostAction } from "@/app/(member)/community-actions";
import { RichEditor } from "@/components/feed/rich-editor";
import { useIsMobile } from "@/components/hooks/use-media-query";
import { Avatar } from "@/components/ui/avatar";
import { UploadTray } from "@/components/feed/upload-tray";
import { useUploads } from "@/components/feed/use-uploads";
import { IMAGE_ACCEPT, VIDEO_ACCEPT } from "@/lib/uploads/policy";
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
  const [scheduledAt, setScheduledAt] = useState("");
  const [scheduling, setScheduling] = useState(false);
  const [pending, startTransition] = useTransition();
  const boxRef = useRef<HTMLTextAreaElement>(null);
  const photoRef = useRef<HTMLInputElement>(null);
  const videoRef = useRef<HTMLInputElement>(null);
  const uploads = useUploads();
  // A placeholder that is clipped mid-sentence reads as a broken control, and
  // "Share something with the community…" does not fit a 320px line.
  const isMobile = useIsMobile();
  const placeholder = isMobile
    ? "Share something…"
    : "Share something with the community…";

  const text = body.trim();
  const heading = title.trim();
  const hasContent = text.length > 0 || heading.length > 0 || uploads.attachments.length > 0;
  const canPost =
    hasContent && text.length <= MAX && Boolean(spaceId) && !pending && !uploads.busy;

  /**
   * One submit for three outcomes.
   *
   * Posting, saving a draft and scheduling differ only in the intent sent with
   * them; the server decides what actually happens, including holding the post
   * for a host when the space asks for that. Duplicating this into three
   * handlers is how they drift apart.
   */
  function submit(intent: "PUBLISH" | "DRAFT" | "SCHEDULE" = "PUBLISH") {
    if (intent !== "DRAFT" && !canPost) return;
    if (intent === "DRAFT" && (!hasContent || !spaceId || pending)) return;
    if (intent === "SCHEDULE" && !scheduledAt) {
      setError("Pick a time to post it.");
      return;
    }

    const data = new FormData();
    data.set("body", text);
    data.set("title", heading);
    data.set("spaceId", spaceId);
    data.set("intent", intent);
    if (intent === "SCHEDULE") data.set("scheduledAt", scheduledAt);
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
        setScheduling(false);
        setScheduledAt("");
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
        "rounded-card border bg-surface shadow-e1 transition-colors",
        open ? "border-brand/40" : "border-border",
      )}
    >
      <div className="flex gap-3 p-3.5">
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

          {/* Collapsed it is one line and nothing more, so the composer never
              pushes the first post below the fold. The full editor appears the
              moment there is something to write. */}
          {open ? (
            <RichEditor
              name="body"
              value={body}
              onChange={setBody}
              rows={4}
              maxLength={MAX}
              disabled={pending}
              placeholder={placeholder}
            />
          ) : (
            <textarea
              ref={boxRef}
              value={body}
              rows={1}
              disabled={pending}
              aria-label="Write a post"
              placeholder={placeholder}
              onFocus={() => setOpen(true)}
              onChange={(event) => {
                setBody(event.currentTarget.value);
                setOpen(true);
                grow(event.currentTarget);
              }}
              className="w-full resize-none border-0 bg-transparent p-0 pt-1 text-[15px] leading-normal text-foreground outline-none placeholder:text-foreground-muted disabled:opacity-60"
            />
          )}

          {open && scheduling ? (
            <div className="mt-2 flex flex-wrap items-center gap-2 rounded-ctl border border-border bg-background px-3 py-2">
              <label
                htmlFor="composer-schedule"
                className="text-[12.5px] font-semibold text-foreground"
              >
                Post at
              </label>
              <input
                id="composer-schedule"
                type="datetime-local"
                value={scheduledAt}
                onChange={(event) => setScheduledAt(event.currentTarget.value)}
                className="h-9 rounded-ctl border border-field-border bg-field-background px-2 text-[13px] text-foreground outline-none focus:border-brand"
              />
              <span className="text-[12px] text-foreground-muted">
                Your device&rsquo;s time zone.
              </span>
            </div>
          ) : null}

          <UploadTray
            items={uploads.items}
            onRemove={uploads.remove}
            onRetry={uploads.retry}
            onAlt={uploads.setAlt}
            onVideoThumbnail={uploads.setVideoThumbnail}
            onClearVideoThumbnail={uploads.clearVideoThumbnail}
          />

          {error ? (
            <p className="mt-2 text-[12.5px] font-semibold text-danger" role="alert">
              {error}
            </p>
          ) : null}

          {open && spaces.length > 1 ? (
            <div className="mt-2.5 flex flex-wrap items-center gap-1">
              <span className="mr-0.5 text-[10.5px] uppercase tracking-[0.12em] text-foreground-muted">
                Post to
              </span>
              {spaces.map((space) => (
                <button
                  key={space.id}
                  type="button"
                  onClick={() => setSpaceId(space.id)}
                  aria-pressed={spaceId === space.id}
                  className={cn(
                    "inline-flex h-6.5 items-center rounded-full px-2 text-[12px] transition",
                    spaceId === space.id
                      ? "bg-brand-wash text-brand ring-1 ring-brand/30"
                      : "text-foreground-muted hover:bg-surface-muted hover:text-foreground",
                  )}
                >
                  {space.name}
                </button>
              ))}
            </div>
          ) : null}

          <div className="mt-2.5 flex flex-wrap items-center gap-0.5 border-t border-border pt-2">
            <input
              ref={photoRef}
              type="file"
              accept={IMAGE_ACCEPT}
              multiple
              className="hidden"
              onChange={(event) => {
                const picked = event.currentTarget.files;
                if (picked?.length) {
                  setOpen(true);
                  uploads.add(picked);
                }
                event.currentTarget.value = "";
              }}
            />
            <input
              ref={videoRef}
              type="file"
              accept={VIDEO_ACCEPT}
              className="hidden"
              onChange={(event) => {
                const picked = event.currentTarget.files;
                if (picked?.length) {
                  setOpen(true);
                  uploads.add(picked);
                }
                event.currentTarget.value = "";
              }}
            />
            <Tool
              icon={ImagePlus}
              label="Photo"
              disabled={!uploadsEnabled}
              title={
                uploadsEnabled
                  ? "Add photos"
                  : "Uploads are not configured on this environment yet"
              }
              onClick={() => photoRef.current?.click()}
            />
            <Tool
              icon={Video}
              label="Video"
              disabled={!uploadsEnabled}
              title={
                uploadsEnabled
                  ? "Add a video"
                  : "Uploads are not configured on this environment yet"
              }
              onClick={() => videoRef.current?.click()}
            />
            <ToolLink href="/compose?type=LINK" icon={Link2} label="Link" />
            <ToolLink href="/compose?type=POLL" icon={ListChecks} label="Poll" />
            <ToolLink href="/compose" icon={Ellipsis} label="" />

            <span className="flex-1" />

            {uploads.busy ? (
              <span className="mr-2 text-[11.5px] text-foreground-muted">
                Uploading…
              </span>
            ) : null}

            {open && text.length > MAX - 500 ? (
              <span
                className={cn(
                  "mr-2 text-[11.5px] tabular-nums",
                  text.length > MAX ? "text-danger" : "text-foreground-muted",
                )}
              >
                {MAX - text.length}
              </span>
            ) : null}

            {open ? (
              <button
                type="button"
                onClick={() => submit("DRAFT")}
                disabled={!hasContent || pending}
                title="Keep this without posting it"
                className="mr-1 inline-flex h-8 items-center rounded-full px-3 text-[13px] text-foreground-muted transition hover:text-foreground disabled:opacity-40"
              >
                Save draft
              </button>
            ) : null}

            {open ? (
              <button
                type="button"
                onClick={() => setScheduling((value) => !value)}
                aria-pressed={scheduling}
                title="Post this later"
                className="mr-1 inline-flex size-8 items-center justify-center rounded-full text-foreground-muted transition hover:text-foreground"
              >
                <CalendarClock className="size-4" aria-hidden />
                <span className="sr-only">Schedule</span>
              </button>
            ) : null}

            {open ? (
              <button
                type="button"
                onClick={() => submit(scheduling ? "SCHEDULE" : "PUBLISH")}
                disabled={!canPost}
                className={cn(
                  "inline-flex h-8 min-w-0 items-center justify-center gap-1.5 rounded-full px-3 sm:min-w-18 sm:px-3.5",
                  "text-[13px] transition active:scale-[0.97]",
                  "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand",
                  "bg-brand-fill text-brand-fill-foreground hover:bg-brand-fill-hover",
                  "disabled:cursor-not-allowed disabled:opacity-40 disabled:active:scale-100",
                  "",
                )}
              >
                {pending ? (
                  <>
                    <Loader2 className="size-3.5 animate-spin" aria-hidden />
                    {scheduling ? "Scheduling" : "Posting"}
                  </>
                ) : scheduling ? (
                  "Schedule"
                ) : (
                  "Post"
                )}
              </button>
            ) : null}
          </div>
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
      className="inline-flex h-8 items-center gap-1.5 rounded-chip px-2 text-[12.5px] text-foreground-muted transition hover:bg-mint hover:text-foreground disabled:cursor-not-allowed disabled:opacity-40 disabled:hover:bg-transparent"
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
      className="inline-flex h-8 items-center gap-1.5 rounded-chip px-2 text-[12.5px] text-foreground-muted no-underline transition hover:bg-mint hover:text-foreground"
      aria-label={label || "More"}
    >
      <Icon className="size-4 text-brand" aria-hidden />
      <span className="hidden sm:inline">{label}</span>
    </Link>
  );
}
