"use client";

import { useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { ImagePlus, Loader2, Plus, Video, X } from "lucide-react";
import { createPostAction } from "@/app/(member)/community-actions";
import { UploadTray } from "@/components/feed/upload-tray";
import { useUploads } from "@/components/feed/use-uploads";
import {
  COMPOSER_TYPES,
  describeIncomplete,
  MAX_POLL_OPTIONS,
  MIN_POLL_OPTIONS,
  typeHasField,
  type ComposerType,
} from "@/lib/community/post-types";
import { ACCEPT, IMAGE_ACCEPT, VIDEO_ACCEPT } from "@/lib/uploads/policy";
import { RichEditor } from "@/components/feed/rich-editor";
import { cn } from "@/lib/utils";

const MAX_BODY = 5000;

/**
 * The full composer.
 *
 * The inline box on Home is for a quick note; this is where the post types that
 * need their own fields live, which is why the inline one has always linked
 * here with `?type=LINK` and `?type=POLL`. Those links worked — the page they
 * pointed at did not exist.
 *
 * Which fields exist is read from the type table rather than written out per
 * type, so a type and its inputs cannot drift apart. The submit button states
 * what is missing instead of sitting greyed out with no explanation, using the
 * same rules the server enforces, so the page never refuses something the
 * server would have taken or vice versa.
 */
export function ComposeForm({
  type: initialType,
  spaces,
  defaultSpaceId,
  uploadsEnabled,
}: {
  /**
   * The chosen type as a plain value, resolved to its full entry here.
   *
   * It cannot arrive as the entry itself: each one carries a Lucide icon,
   * which is a function, and React refuses to serialise a function across the
   * server-to-client boundary. Passing the object made this page a 500 for
   * every signed-in member.
   */
  type: ComposerType["value"];
  spaces: { id: string; name: string }[];
  defaultSpaceId: string | null;
  uploadsEnabled: boolean;
}) {
  const router = useRouter();
  const [type, setType] = useState<ComposerType>(
    () => COMPOSER_TYPES.find((entry) => entry.value === initialType) ?? COMPOSER_TYPES[0]!,
  );
  const [spaceId, setSpaceId] = useState(defaultSpaceId ?? spaces[0]?.id ?? "");
  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");
  const [link, setLink] = useState("");
  const [pollOptions, setPollOptions] = useState(["", ""]);
  const [startsAt, setStartsAt] = useState("");
  const [endsAt, setEndsAt] = useState("");
  const [location, setLocation] = useState("");
  const [zoomUrl, setZoomUrl] = useState("");
  const [capacity, setCapacity] = useState("");
  const [method, setMethod] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const uploads = useUploads();
  const imageRef = useRef<HTMLInputElement>(null);
  const videoRef = useRef<HTMLInputElement>(null);

  const missing = describeIncomplete({
    startsAt,
    method,
    type,
    title,
    body,
    link,
    pollOptions,
    attachments: uploads.attachments.length,
    spaceId,
  });
  const tooLong = body.length > MAX_BODY;
  const blocked = missing ?? (tooLong ? "That post is too long." : null);
  const canPost = !blocked && !pending && !uploads.busy;

  function submit() {
    if (!canPost) return;
    setError(null);

    const data = new FormData();
    data.set("type", type.value);
    data.set("spaceId", spaceId);
    data.set("body", body);
    if (title.trim()) data.set("title", title.trim());
    if (typeHasField(type, "link")) data.set("linkUrl", link.trim());
    if (typeHasField(type, "event")) {
      data.set("startsAt", startsAt);
      if (endsAt) data.set("endsAt", endsAt);
      if (location.trim()) data.set("location", location.trim());
      if (zoomUrl.trim()) data.set("zoomUrl", zoomUrl.trim());
      if (capacity.trim()) data.set("capacity", capacity.trim());
    }
    if (typeHasField(type, "recipe")) data.set("method", method);
    if (typeHasField(type, "poll")) {
      pollOptions.slice(0, MAX_POLL_OPTIONS).forEach((option, index) => {
        if (option.trim()) data.set(`poll${index + 1}`, option.trim());
      });
    }
    if (uploads.attachments.length > 0) {
      data.set("attachments", JSON.stringify(uploads.attachments));
    }

    startTransition(async () => {
      const result = await createPostAction(data);
      if (!result.ok) {
        setError(result.error);
        return;
      }
      uploads.reset();
      router.push("/home");
      router.refresh();
    });
  }

  function setOption(index: number, value: string) {
    setPollOptions((current) =>
      current.map((option, i) => (i === index ? value : option)),
    );
  }

  return (
    <div className="space-y-4">
      {/* Type picker. A row of real buttons rather than a dropdown: with five
          options the whole set fits, and seeing them is how someone learns a
          poll is available at all. */}
      <div>
        <p className="mb-1.5 text-[12.5px] font-semibold text-foreground">
          What are you posting?
        </p>
        <ul className="flex flex-wrap gap-1.5">
          {COMPOSER_TYPES.map((option) => {
            const Icon = option.icon;
            const current = option.value === type.value;
            return (
              <li key={option.value}>
                <button
                  type="button"
                  onClick={() => setType(option)}
                  aria-pressed={current}
                  className={cn(
                    "vu-btn inline-flex h-9 items-center gap-1.5 px-3 text-[13px]",
                    current ? "vu-btn-primary" : "vu-btn-secondary",
                  )}
                >
                  <Icon className="size-4" aria-hidden />
                  {option.label}
                </button>
              </li>
            );
          })}
        </ul>
        <p className="mt-1.5 text-[12px] text-foreground-muted">{type.hint}</p>
      </div>

      {typeHasField(type, "title") ? (
        <div>
          <label
            htmlFor="compose-title"
            className="mb-1.5 block text-[12.5px] font-semibold text-foreground"
          >
            {type.titleLabel ?? "Title"}
            {type.titleRequired ? null : (
              <span className="ml-1 font-normal text-foreground-muted">
                (optional)
              </span>
            )}
          </label>
          <input
            id="compose-title"
            value={title}
            onChange={(event) => setTitle(event.target.value)}
            maxLength={200}
            className="h-10 w-full rounded-ctl border border-field-border bg-field-background px-3 text-[14.5px] text-foreground outline-none transition placeholder:text-field-placeholder focus:border-brand focus:ring-2 focus:ring-brand/20"
          />
        </div>
      ) : null}

      {typeHasField(type, "link") ? (
        <div>
          <label
            htmlFor="compose-link"
            className="mb-1.5 block text-[12.5px] font-semibold text-foreground"
          >
            Link
          </label>
          <input
            id="compose-link"
            type="url"
            inputMode="url"
            value={link}
            onChange={(event) => setLink(event.target.value)}
            placeholder="https://"
            className="h-10 w-full rounded-ctl border border-field-border bg-field-background px-3 text-[14.5px] text-foreground outline-none transition placeholder:text-field-placeholder focus:border-brand focus:ring-2 focus:ring-brand/20"
          />
        </div>
      ) : null}

      <div>
        <label
          htmlFor="compose-body"
          className="mb-1.5 block text-[12.5px] font-semibold text-foreground"
        >
          {typeHasField(type, "title") ? "Details" : "Post"}
        </label>
        <RichEditor
          id="compose-body"
          name="body"
          value={body}
          onChange={setBody}
          rows={type.value === "ARTICLE" ? 14 : 7}
          maxLength={MAX_BODY}
          placeholder={type.bodyPlaceholder}
        />
        <p
          className={cn(
            "mt-1 text-right text-[11.5px] tabular-nums",
            tooLong ? "font-semibold text-danger" : "text-foreground-muted",
          )}
        >
          {body.length} / {MAX_BODY}
        </p>
      </div>

      {typeHasField(type, "event") ? (
        <fieldset className="space-y-3 rounded-card border border-border bg-surface p-4">
          <legend className="px-1 text-[12.5px] font-semibold text-foreground">
            When and where
          </legend>
          <div className="grid gap-3 sm:grid-cols-2">
            <Labelled label="Starts" htmlFor="event-starts">
              <input
                id="event-starts"
                type="datetime-local"
                value={startsAt}
                onChange={(event) => setStartsAt(event.target.value)}
                required
                className={FIELD}
              />
            </Labelled>
            <Labelled label="Ends (optional)" htmlFor="event-ends">
              <input
                id="event-ends"
                type="datetime-local"
                value={endsAt}
                onChange={(event) => setEndsAt(event.target.value)}
                className={FIELD}
              />
            </Labelled>
          </div>
          <Labelled label="Where (optional)" htmlFor="event-location">
            <input
              id="event-location"
              value={location}
              onChange={(event) => setLocation(event.target.value)}
              maxLength={200}
              placeholder="A kitchen, a park, online"
              className={FIELD}
            />
          </Labelled>
          <div className="grid gap-3 sm:grid-cols-2">
            <Labelled label="Joining link (optional)" htmlFor="event-zoom">
              <input
                id="event-zoom"
                type="url"
                value={zoomUrl}
                onChange={(event) => setZoomUrl(event.target.value)}
                placeholder="https://"
                className={FIELD}
              />
            </Labelled>
            <Labelled label="Places (optional)" htmlFor="event-capacity">
              <input
                id="event-capacity"
                type="number"
                min={1}
                value={capacity}
                onChange={(event) => setCapacity(event.target.value)}
                placeholder="No limit"
                className={FIELD}
              />
            </Labelled>
          </div>
          <p className="text-[12px] text-foreground-muted">
            It joins this space&rsquo;s calendar as well as the feed.
          </p>
        </fieldset>
      ) : null}

      {typeHasField(type, "recipe") ? (
        <div>
          <label
            htmlFor="recipe-method"
            className="mb-1.5 block text-[12.5px] font-semibold text-foreground"
          >
            The method
          </label>
          <textarea
            id="recipe-method"
            value={method}
            onChange={(event) => setMethod(event.target.value)}
            rows={10}
            maxLength={20000}
            placeholder={"Ingredients, then steps. Markdown works:\n\n- 2 onions\n- 400g tomatoes\n\n1. Soften the onions.\n2. Add everything else."}
            className="w-full resize-y rounded-ctl border border-field-border bg-field-background px-3 py-2.5 text-[14.5px] leading-relaxed text-foreground outline-none transition placeholder:text-field-placeholder focus:border-brand focus:ring-2 focus:ring-brand/20"
          />
          <p className="mt-1 text-[12px] text-foreground-muted">
            Saved as a recipe of its own, so it can be found later.
          </p>
        </div>
      ) : null}

      {typeHasField(type, "poll") ? (
        <div>
          <p className="mb-1.5 text-[12.5px] font-semibold text-foreground">
            Options
          </p>
          <ul className="space-y-2">
            {pollOptions.map((option, index) => (
              <li key={index} className="flex items-center gap-2">
                <input
                  value={option}
                  onChange={(event) => setOption(index, event.target.value)}
                  maxLength={120}
                  aria-label={`Option ${index + 1}`}
                  placeholder={`Option ${index + 1}`}
                  className="h-10 min-w-0 flex-1 rounded-ctl border border-field-border bg-field-background px-3 text-[14px] text-foreground outline-none transition placeholder:text-field-placeholder focus:border-brand focus:ring-2 focus:ring-brand/20"
                />
                {pollOptions.length > MIN_POLL_OPTIONS ? (
                  <button
                    type="button"
                    onClick={() =>
                      setPollOptions((current) =>
                        current.filter((_, i) => i !== index),
                      )
                    }
                    aria-label={`Remove option ${index + 1}`}
                    className="grid size-9 shrink-0 place-items-center rounded-ctl text-foreground-muted transition hover:bg-default hover:text-foreground"
                  >
                    <X className="size-4" aria-hidden />
                  </button>
                ) : null}
              </li>
            ))}
          </ul>
          {pollOptions.length < MAX_POLL_OPTIONS ? (
            <button
              type="button"
              onClick={() => setPollOptions((current) => [...current, ""])}
              className="vu-btn vu-btn-secondary mt-2 inline-flex h-9 items-center gap-1.5 px-3 text-[13px]"
            >
              <Plus className="size-4" aria-hidden />
              Add option
            </button>
          ) : (
            <p className="mt-2 text-[12px] text-foreground-muted">
              Four options is the most a poll can carry.
            </p>
          )}
        </div>
      ) : null}

      {typeHasField(type, "media") && uploadsEnabled ? (
        <div>
          <p className="mb-1.5 text-[12.5px] font-semibold text-foreground">
            Photos and video
          </p>
          <input
            ref={imageRef}
            type="file"
            accept={IMAGE_ACCEPT}
            multiple
            className="sr-only"
            onChange={(event) => {
              if (event.target.files) uploads.add(event.target.files);
              event.target.value = "";
            }}
          />
          <input
            ref={videoRef}
            type="file"
            accept={VIDEO_ACCEPT}
            className="sr-only"
            onChange={(event) => {
              if (event.target.files) uploads.add(event.target.files);
              event.target.value = "";
            }}
          />
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              onClick={() => imageRef.current?.click()}
              className="vu-btn vu-btn-secondary inline-flex h-9 items-center gap-1.5 px-3 text-[13px]"
            >
              <ImagePlus className="size-4" aria-hidden />
              Add photos
            </button>
            <button
              type="button"
              onClick={() => videoRef.current?.click()}
              className="vu-btn vu-btn-secondary inline-flex h-9 items-center gap-1.5 px-3 text-[13px]"
            >
              <Video className="size-4" aria-hidden />
              Add a video
            </button>
          </div>

          <UploadTray
            items={uploads.items}
            onRemove={uploads.remove}
            onRetry={uploads.retry}
            onAlt={uploads.setAlt}
            onVideoThumbnail={uploads.setVideoThumbnail}
            onClearVideoThumbnail={uploads.clearVideoThumbnail}
          />
          <p className="sr-only">{ACCEPT}</p>
        </div>
      ) : null}

      <div>
        <p className="mb-1.5 text-[12.5px] font-semibold text-foreground">
          Post it in
        </p>
        {spaces.length === 0 ? (
          <p className="rounded-ctl border border-dashed border-border px-3 py-2.5 text-[13px] text-foreground-muted">
            You have not joined a room yet, so there is nowhere to post.{" "}
            <Link href="/spaces" className="font-semibold text-link underline">
              Find one
            </Link>
          </p>
        ) : (
          <ul className="flex flex-wrap gap-1.5">
            {spaces.map((space) => (
              <li key={space.id}>
                <button
                  type="button"
                  onClick={() => setSpaceId(space.id)}
                  aria-pressed={spaceId === space.id}
                  className={cn(
                    "vu-btn inline-flex h-8 items-center px-3 text-[12.5px]",
                    spaceId === space.id ? "vu-btn-primary" : "vu-btn-secondary",
                  )}
                >
                  {space.name}
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>

      {error ? (
        <p role="alert" className="text-[13px] font-semibold text-danger">
          {error}
        </p>
      ) : null}

      <div className="flex flex-wrap items-center justify-between gap-3 border-t border-border pt-4">
        <p className="text-[12.5px] text-foreground-muted">
          {blocked ?? "Ready to post."}
        </p>
        <div className="flex items-center gap-2">
          <Link
            href="/home"
            className="vu-btn vu-btn-secondary inline-flex h-10 items-center px-4 text-[14px] no-underline"
          >
            Cancel
          </Link>
          <button
            type="button"
            onClick={submit}
            disabled={!canPost}
            className="vu-btn vu-btn-primary inline-flex h-10 items-center gap-1.5 px-5 text-[14px]"
          >
            {pending || uploads.busy ? (
              <>
                <Loader2 className="size-4 animate-spin" aria-hidden />
                {uploads.busy ? "Uploading" : "Posting"}
              </>
            ) : (
              "Post"
            )}
          </button>
        </div>
      </div>
    </div>
  );
}

const FIELD =
  "h-11 w-full rounded-ctl border border-field-border bg-field-background px-3 text-[14.5px] text-foreground outline-none transition placeholder:text-field-placeholder focus:border-brand focus:ring-2 focus:ring-brand/20";

/** A label and its input, with the label actually bound to it. */
function Labelled({
  label,
  htmlFor,
  children,
}: {
  label: string;
  htmlFor: string;
  children: React.ReactNode;
}) {
  return (
    <div>
      <label
        htmlFor={htmlFor}
        className="mb-1.5 block text-[12.5px] font-semibold text-foreground"
      >
        {label}
      </label>
      {children}
    </div>
  );
}
