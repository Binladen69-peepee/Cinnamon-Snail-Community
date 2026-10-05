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
import {
  Button,
  ButtonLink,
  Callout,
  Field,
  chipClass,
  fieldClass,
} from "@/components/app/ui";
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
    <div className="flex flex-col gap-6">
      {/* Type picker. A row of real buttons rather than a dropdown: with five
          options the whole set fits, and seeing them is how someone learns a
          poll is available at all. */}
      <div>
        <p className="mb-2 text-label font-medium text-foreground">
          What are you posting?
        </p>
        <ul className="flex flex-wrap gap-2">
          {COMPOSER_TYPES.map((option) => {
            const Icon = option.icon;
            const current = option.value === type.value;
            return (
              <li key={option.value}>
                <button
                  type="button"
                  onClick={() => setType(option)}
                  aria-pressed={current}
                  className={chipClass(current, "h-9 px-3.5")}
                >
                  <Icon aria-hidden />
                  {option.label}
                </button>
              </li>
            );
          })}
        </ul>
        <p className="mt-2 text-caption text-foreground-muted">{type.hint}</p>
      </div>

      {typeHasField(type, "title") ? (
        <Field
          htmlFor="compose-title"
          label={
            <>
              {type.titleLabel ?? "Title"}
              {type.titleRequired ? null : (
                <span className="ml-1 font-normal text-foreground-muted">
                  (optional)
                </span>
              )}
            </>
          }
        >
          <input
            id="compose-title"
            value={title}
            onChange={(event) => setTitle(event.target.value)}
            maxLength={200}
            className={fieldClass({ size: "lg" })}
          />
        </Field>
      ) : null}

      {typeHasField(type, "link") ? (
        <Field label="Link" htmlFor="compose-link">
          <input
            id="compose-link"
            type="url"
            inputMode="url"
            value={link}
            onChange={(event) => setLink(event.target.value)}
            placeholder="https://"
            className={fieldClass({ size: "lg" })}
          />
        </Field>
      ) : null}

      <div>
        <label
          htmlFor="compose-body"
          className="mb-1.5 block text-label font-medium text-foreground"
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
            "mt-1.5 text-right text-caption tabular-nums",
            tooLong ? "font-medium text-danger" : "text-foreground-muted",
          )}
        >
          {body.length} / {MAX_BODY}
        </p>
      </div>

      {typeHasField(type, "event") ? (
        <fieldset className="rounded-ctl bg-surface-muted p-4">
          {/* Floated so it lays out as an ordinary heading inside the well,
              rather than sitting on the fieldset's top edge. */}
          <legend className="float-left mb-3 w-full p-0 text-body font-semibold text-foreground">
            When and where
          </legend>
          <div className="clear-both flex flex-col gap-4">
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <Field label="Starts" htmlFor="event-starts">
                <input
                  id="event-starts"
                  type="datetime-local"
                  value={startsAt}
                  onChange={(event) => setStartsAt(event.target.value)}
                  required
                  className={FIELD}
                />
              </Field>
              <Field label="Ends (optional)" htmlFor="event-ends">
                <input
                  id="event-ends"
                  type="datetime-local"
                  value={endsAt}
                  onChange={(event) => setEndsAt(event.target.value)}
                  className={FIELD}
                />
              </Field>
            </div>
            <Field label="Where (optional)" htmlFor="event-location">
              <input
                id="event-location"
                value={location}
                onChange={(event) => setLocation(event.target.value)}
                maxLength={200}
                placeholder="A kitchen, a park, online"
                className={FIELD}
              />
            </Field>
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <Field label="Joining link (optional)" htmlFor="event-zoom">
                <input
                  id="event-zoom"
                  type="url"
                  value={zoomUrl}
                  onChange={(event) => setZoomUrl(event.target.value)}
                  placeholder="https://"
                  className={FIELD}
                />
              </Field>
              <Field label="Places (optional)" htmlFor="event-capacity">
                <input
                  id="event-capacity"
                  type="number"
                  min={1}
                  value={capacity}
                  onChange={(event) => setCapacity(event.target.value)}
                  placeholder="No limit"
                  className={FIELD}
                />
              </Field>
            </div>
            <p className="text-caption text-foreground-muted">
              It joins this space&rsquo;s calendar as well as the feed.
            </p>
          </div>
        </fieldset>
      ) : null}

      {typeHasField(type, "recipe") ? (
        <Field
          label="The method"
          htmlFor="recipe-method"
          hint="Saved as a recipe of its own, so it can be found later."
        >
          <textarea
            id="recipe-method"
            value={method}
            onChange={(event) => setMethod(event.target.value)}
            rows={10}
            maxLength={20000}
            placeholder={"Ingredients, then steps. Markdown works:\n\n- 2 onions\n- 400g tomatoes\n\n1. Soften the onions.\n2. Add everything else."}
            className={fieldClass({ multiline: true, className: "block resize-y px-3.5 py-3" })}
          />
        </Field>
      ) : null}

      {typeHasField(type, "poll") ? (
        <div>
          <p className="mb-1.5 text-label font-medium text-foreground">
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
                  className={fieldClass({ size: "lg", className: "flex-1" })}
                />
                {pollOptions.length > MIN_POLL_OPTIONS ? (
                  <Button
                    variant="ghost"
                    size="lg"
                    iconOnly
                    onClick={() =>
                      setPollOptions((current) =>
                        current.filter((_, i) => i !== index),
                      )
                    }
                    aria-label={`Remove option ${index + 1}`}
                  >
                    <X className="size-4" aria-hidden />
                  </Button>
                ) : null}
              </li>
            ))}
          </ul>
          {pollOptions.length < MAX_POLL_OPTIONS ? (
            <Button
              size="sm"
              onClick={() => setPollOptions((current) => [...current, ""])}
              className="mt-2.5"
            >
              <Plus className="size-4" aria-hidden />
              Add option
            </Button>
          ) : (
            <p className="mt-2.5 text-caption text-foreground-muted">
              Four options is the most a poll can carry.
            </p>
          )}
        </div>
      ) : null}

      {typeHasField(type, "media") && uploadsEnabled ? (
        <div>
          <p className="mb-1.5 text-label font-medium text-foreground">
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
            <Button size="sm" onClick={() => imageRef.current?.click()}>
              <ImagePlus className="size-4" aria-hidden />
              Add photos
            </Button>
            <Button size="sm" onClick={() => videoRef.current?.click()}>
              <Video className="size-4" aria-hidden />
              Add a video
            </Button>
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
        <p className="mb-2 text-label font-medium text-foreground">
          Post it in
        </p>
        {spaces.length === 0 ? (
          <p className="rounded-ctl border border-dashed border-hairline-firm px-3.5 py-3 text-label text-foreground-muted">
            You have not joined a room yet, so there is nowhere to post.{" "}
            <Link href="/spaces" className="font-medium text-link underline">
              Find one
            </Link>
          </p>
        ) : (
          <ul className="flex flex-wrap gap-2">
            {spaces.map((space) => (
              <li key={space.id}>
                <button
                  type="button"
                  onClick={() => setSpaceId(space.id)}
                  aria-pressed={spaceId === space.id}
                  className={chipClass(spaceId === space.id)}
                >
                  {space.name}
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>

      {error ? <Callout tone="danger">{error}</Callout> : null}

      <div className="flex flex-col gap-3 border-t border-separator pt-5 sm:flex-row sm:items-center sm:justify-between">
        <p className="text-label text-foreground-muted">
          {blocked ?? "Ready to post."}
        </p>
        <div className="flex items-center justify-end gap-2">
          <ButtonLink href="/home" size="lg">
            Cancel
          </ButtonLink>
          <Button
            variant="primary"
            size="lg"
            onClick={submit}
            disabled={!canPost}
            className="min-w-24"
          >
            {pending || uploads.busy ? (
              <>
                <Loader2 className="size-4 animate-spin" aria-hidden />
                {uploads.busy ? "Uploading" : "Posting"}
              </>
            ) : (
              "Post"
            )}
          </Button>
        </div>
      </div>
    </div>
  );
}

/** Every single-line input in the form shares one height. */
const FIELD = fieldClass({ size: "lg" });
