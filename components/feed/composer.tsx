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
import { Button, cardClass, chipClass, fieldClass } from "@/components/app/ui";
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
      <div className={cardClass({ className: "text-body text-foreground-muted" })}>
        You need a space membership before you can post. Ask a host to seat you
        at a table.
      </div>
    );
  }

  return (
    <section
      className={cn(
        "rounded-card border bg-surface transition-[border-color,box-shadow]",
        open ? "border-hairline-firm shadow-e2" : "border-border shadow-e1",
      )}
    >
      <div className="flex gap-3 p-4">
        <Avatar name={name} src={avatar} size="sm" />

        <div className="min-w-0 flex-1">
          {open ? (
            <input
              value={title}
              onChange={(event) => setTitle(event.currentTarget.value)}
              placeholder="Title (optional)"
              aria-label="Post title"
              maxLength={300}
              className="mb-2 w-full border-0 bg-transparent p-0 pt-1.5 text-title font-semibold text-foreground outline-none placeholder:font-medium placeholder:text-field-placeholder"
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
              className="w-full resize-none border-0 bg-transparent p-0 pt-1.5 text-reading leading-normal text-foreground outline-none placeholder:text-field-placeholder disabled:opacity-60"
            />
          )}

          {open && scheduling ? (
            <div className="mt-3 flex flex-wrap items-center gap-x-3 gap-y-2 rounded-ctl bg-surface-muted px-3 py-2.5">
              <label
                htmlFor="composer-schedule"
                className="text-label font-medium text-foreground"
              >
                Post at
              </label>
              <input
                id="composer-schedule"
                type="datetime-local"
                value={scheduledAt}
                onChange={(event) => setScheduledAt(event.currentTarget.value)}
                className={fieldClass({ size: "sm", className: "w-auto" })}
              />
              <span className="text-caption text-foreground-muted">
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
            <p className="mt-2 text-caption font-medium text-danger" role="alert">
              {error}
            </p>
          ) : null}

          {open && spaces.length > 1 ? (
            <div className="mt-3 flex flex-wrap items-center gap-1.5">
              <span className="mr-1 text-micro font-semibold uppercase tracking-[0.08em] text-foreground-muted">
                Post to
              </span>
              {spaces.map((space) => (
                <button
                  key={space.id}
                  type="button"
                  onClick={() => setSpaceId(space.id)}
                  aria-pressed={spaceId === space.id}
                  className={chipClass(spaceId === space.id, "h-7 px-2.5")}
                >
                  {space.name}
                </button>
              ))}
            </div>
          ) : null}

          <div className="mt-3 flex flex-wrap items-center gap-0.5 border-t border-separator pt-2.5">
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
              <span className="mr-2 text-caption text-foreground-muted">
                Uploading…
              </span>
            ) : null}

            {open && text.length > MAX - 500 ? (
              <span
                className={cn(
                  "mr-2 text-caption tabular-nums",
                  text.length > MAX ? "font-medium text-danger" : "text-foreground-muted",
                )}
              >
                {MAX - text.length}
              </span>
            ) : null}

            {open ? (
              <Button
                variant="ghost"
                size="sm"
                onClick={() => submit("DRAFT")}
                disabled={!hasContent || pending}
                title="Keep this without posting it"
                className="mr-0.5"
              >
                Save draft
              </Button>
            ) : null}

            {open ? (
              <button
                type="button"
                onClick={() => setScheduling((value) => !value)}
                aria-pressed={scheduling}
                title="Post this later"
                className={cn(
                  TOOL,
                  "mr-1 w-8 justify-center px-0",
                  scheduling && "bg-brand-wash text-on-brand-wash hover:bg-brand-wash hover:text-on-brand-wash",
                )}
              >
                <CalendarClock className="size-4" aria-hidden />
                <span className="sr-only">Schedule</span>
              </button>
            ) : null}

            {open ? (
              <Button
                variant="primary"
                size="sm"
                onClick={() => submit(scheduling ? "SCHEDULE" : "PUBLISH")}
                disabled={!canPost}
                className="min-w-0 sm:min-w-18"
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
              </Button>
            ) : null}
          </div>
        </div>
      </div>
    </section>
  );
}

/**
 * A composer tool: quieter than a ghost button, because the row holds six of
 * them and the Post button is the one meant to be seen. The icon carries the
 * brand colour; the label comes in at `sm`.
 */
const TOOL =
  "inline-flex h-8 items-center gap-1.5 rounded-ctl px-2 text-label font-medium text-foreground-muted no-underline transition hover:bg-surface-muted hover:text-foreground disabled:cursor-not-allowed disabled:opacity-50 disabled:hover:bg-transparent";

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
      className={TOOL}
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
      className={TOOL}
      aria-label={label || "More"}
    >
      <Icon className="size-4 text-brand" aria-hidden />
      <span className="hidden sm:inline">{label}</span>
    </Link>
  );
}
