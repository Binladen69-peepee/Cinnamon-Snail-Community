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
import { Button, Callout, fieldClass } from "@/components/app/ui";
import { UploadTray } from "@/components/feed/upload-tray";
import { useUploads } from "@/components/feed/use-uploads";
import { POST_BODY_MAX, POST_TITLE_MAX } from "@/lib/community/post-types";
import { IMAGE_ACCEPT, VIDEO_ACCEPT } from "@/lib/uploads/policy";
import { cn } from "@/lib/utils";

export type ComposerSpace = { id: string; name: string; slug: string };

const MAX = POST_BODY_MAX;

type Notice = { text: string; href: string; link: string };

/**
 * The composer.
 *
 * Collapsed it is one line, so it never pushes the first post below the fold.
 * Focused it grows and shows the attachment controls. Posting does not
 * navigate: the box clears and the Kitchen Table re-renders underneath, so the
 * new post appears and you keep your place.
 *
 * Every post goes to the Kitchen Table (DEC-078), so there is no room picker,
 * and drafts are no longer started here (the client removed Drafts). A post
 * that does not go live straight away — held for a host, or scheduled — says
 * where it went instead of silently disappearing.
 *
 * A title field appears only once there is something to title. Reddit makes the
 * title mandatory and the body optional; here it is the reverse, because most
 * posts in this community are a photo and a sentence rather than an article.
 */
export function Composer({
  name,
  avatar,
  uploadsEnabled = false,
}: {
  name: string;
  avatar: string | null;
  /** Retired: every post goes to the Kitchen Table. Accepted so callers compile. */
  spaces?: ComposerSpace[];
  /** Retired, as `spaces`. */
  defaultSpaceId?: string;
  uploadsEnabled?: boolean;
}) {
  const [body, setBody] = useState("");
  const [title, setTitle] = useState("");
  const [open, setOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<Notice | null>(null);
  const [scheduledAt, setScheduledAt] = useState("");
  const [scheduling, setScheduling] = useState(false);
  const [pending, startTransition] = useTransition();
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
  const canPost = hasContent && text.length <= MAX && !pending && !uploads.busy;

  /**
   * Files from the editor (a GIF from the GIF panel's upload button, a photo
   * pasted or dropped into the text) attach through the same upload tray as
   * the photo button, and play in the post like any other upload.
   */
  function attach(files: File[]) {
    if (!files.length) return;
    setOpen(true);
    uploads.add(files);
  }

  /**
   * One submit for two outcomes.
   *
   * Posting and scheduling differ only in the intent sent with them; the
   * server decides what actually happens, including holding the post for a
   * host when the Kitchen Table asks for that.
   */
  function submit(intent: "PUBLISH" | "SCHEDULE" = "PUBLISH") {
    if (!canPost) return;
    if (intent === "SCHEDULE" && !scheduledAt) {
      setError("Pick a time to post it.");
      return;
    }

    const data = new FormData();
    data.set("body", text);
    data.set("title", heading);
    data.set("intent", intent);
    if (intent === "SCHEDULE") {
      // Sent as an instant, so the server reads the member's own clock time.
      const at = new Date(scheduledAt);
      data.set("scheduledAt", Number.isNaN(at.getTime()) ? scheduledAt : at.toISOString());
    }
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
        setNotice(
          result.status === "PENDING"
            ? {
                text: "Sent to a host. It appears in the Kitchen Table once they let it through.",
                href: "/drafts?tab=PENDING",
                link: "See posts in review",
              }
            : result.status === "SCHEDULED"
              ? {
                  text: `Scheduled for ${new Date(result.scheduledAt ?? Date.now()).toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" })}.`,
                  href: "/drafts?tab=SCHEDULED",
                  link: "See scheduled posts",
                }
              : null,
        );
      } else {
        setNotice(null);
        setError(result.error);
      }
    });
  }

  return (
    <section
      aria-label="New post"
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
              maxLength={POST_TITLE_MAX}
              className="mb-2 w-full border-0 bg-transparent p-0 pt-1.5 text-title font-semibold text-foreground outline-none placeholder:font-medium placeholder:text-field-placeholder"
            />
          ) : null}

          {/* Collapsed it is one line and nothing more, so the composer never
              pushes the first post below the fold. It is the same editing
              surface either way: focusing it opens the toolbar around it, and
              the caret stays where it was put. */}
          <RichEditor
            name="body"
            value={body}
            onChange={setBody}
            collapsed={!open}
            onFocus={() => {
              setOpen(true);
              setNotice(null);
            }}
            label="Write a post"
            rows={4}
            maxLength={MAX}
            disabled={pending}
            placeholder={placeholder}
            onGifFiles={uploadsEnabled ? attach : undefined}
            onFiles={uploadsEnabled ? attach : undefined}
          />

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

          {notice && !open ? (
            <Callout tone="info" className="mt-3 text-label" role="status">
              {notice.text}{" "}
              <Link href={notice.href} className="font-medium text-link underline">
                {notice.link}
              </Link>
            </Callout>
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
