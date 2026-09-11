"use client";

import Link from "next/link";
import { useRef, useState, useTransition } from "react";
import { CalendarDays, ImagePlus, ListChecks, Loader2, Soup } from "lucide-react";
import { createFeedPostAction } from "@/app/(member)/community-actions";
import { Avatar } from "@/components/ui/avatar";
import { cn } from "@/lib/utils";

export type ComposerSpace = { id: string; name: string; slug: string };

const MAX = 5000;

/**
 * The inline composer.
 *
 * Replaces a link to /compose — a separate page with `<select>` dropdowns for
 * space and type that redirected when it was done. Writing a post is the thing
 * this product exists for, so it happens where you are reading, and the feed
 * never navigates: the post is written, the box clears, and the list
 * revalidates underneath.
 *
 * It grows on focus. At rest it is one line, so it does not push the first post
 * below the fold; once you are writing it shows the space picker and the
 * shortcuts.
 */
export function FeedComposer({
  name,
  avatar,
  spaces,
  defaultSpaceId,
}: {
  name: string;
  avatar: string | null;
  spaces: ComposerSpace[];
  defaultSpaceId?: string;
}) {
  const [value, setValue] = useState("");
  const [spaceId, setSpaceId] = useState(defaultSpaceId ?? spaces[0]?.id ?? "");
  const [open, setOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const boxRef = useRef<HTMLTextAreaElement>(null);

  const body = value.trim();
  const canPost = body.length > 0 && body.length <= MAX && Boolean(spaceId) && !pending;

  function submit() {
    if (!canPost) return;
    const data = new FormData();
    data.set("body", body);
    data.set("spaceId", spaceId);
    data.set("type", "SIMPLE");

    startTransition(async () => {
      const result = await createFeedPostAction(data);
      if (result.ok) {
        setValue("");
        setError(null);
        setOpen(false);
        // Give the height back, since the box grew with the text.
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
      <div className="rounded-card border border-border/70 bg-surface p-4 text-sm text-foreground-muted">
        You need a space membership before you can post. Ask a host to seat you
        at a table.
      </div>
    );
  }

  return (
    <section
      className={cn(
        "rounded-card border bg-surface transition-colors",
        open ? "border-brand/40" : "border-border/70",
      )}
    >
      <div className="flex gap-3 p-3 sm:p-4">
        <Avatar name={name} src={avatar} />

        <div className="min-w-0 flex-1">
          <textarea
            ref={boxRef}
            value={value}
            rows={1}
            disabled={pending}
            aria-label="Write a post"
            placeholder="Share a plate, a question, or what went wrong…"
            onFocus={() => setOpen(true)}
            onChange={(event) => {
              setValue(event.currentTarget.value);
              grow(event.currentTarget);
            }}
            onKeyDown={(event) => {
              // Cmd/Ctrl+Enter posts, which is what anyone who writes in a
              // feed all day will reach for.
              if ((event.metaKey || event.ctrlKey) && event.key === "Enter") {
                event.preventDefault();
                submit();
              }
            }}
            className={cn(
              "w-full resize-none border-0 bg-transparent p-0 pt-1.5 text-[16px] leading-[1.5] text-foreground outline-none",
              "placeholder:text-foreground-muted disabled:opacity-60",
            )}
          />

          {error ? (
            <p className="mt-2 text-[13px] font-medium text-danger" role="alert">
              {error}
            </p>
          ) : null}

          {open ? (
            <>
              {/* Space picker. Chips rather than a <select>, so where the post
                  lands is visible without opening anything. */}
              {spaces.length > 1 ? (
                <div className="mt-3 flex flex-wrap items-center gap-1.5">
                  <span className="text-[11px] font-bold uppercase tracking-[0.12em] text-foreground-muted">
                    Post to
                  </span>
                  {spaces.map((space) => (
                    <button
                      key={space.id}
                      type="button"
                      onClick={() => setSpaceId(space.id)}
                      aria-pressed={spaceId === space.id}
                      className={cn(
                        "inline-flex h-7 items-center rounded-full px-2.5 text-[12.5px] font-semibold transition",
                        spaceId === space.id
                          ? "bg-brand-wash text-brand-strong ring-1 ring-brand/30"
                          : "text-foreground-muted hover:bg-mint hover:text-foreground",
                      )}
                    >
                      {space.name}
                    </button>
                  ))}
                </div>
              ) : null}

              <div className="mt-3 flex items-center gap-0.5 border-t border-border/60 pt-2.5">
                {/* Photos, polls and events still need the full editor. The
                    upload pipeline lands next; until then these route rather
                    than pretending to work here. */}
                <Shortcut
                  href="/compose?type=IMAGE"
                  icon={ImagePlus}
                  label="Photo"
                />
                <Shortcut href="/compose?type=RECIPE" icon={Soup} label="Recipe" />
                <Shortcut href="/compose?type=POLL" icon={ListChecks} label="Poll" />
                <Shortcut
                  href="/compose?type=EVENT"
                  icon={CalendarDays}
                  label="Event"
                />

                <span className="flex-1" />

                {body.length > MAX - 500 ? (
                  <span
                    className={cn(
                      "mr-2 text-[12px] font-semibold tabular-nums",
                      body.length > MAX ? "text-danger" : "text-foreground-muted",
                    )}
                  >
                    {MAX - body.length}
                  </span>
                ) : null}

                <button
                  type="button"
                  onClick={submit}
                  disabled={!canPost}
                  className={cn(
                    "inline-flex h-9 min-w-[5.25rem] items-center justify-center gap-1.5 rounded-full px-4",
                    "text-[14px] font-bold transition active:scale-[0.97]",
                    "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand",
                    "bg-forest text-paper hover:bg-deep-forest",
                    "disabled:cursor-not-allowed disabled:opacity-40 disabled:active:scale-100",
                    "dark:bg-brand dark:text-[#06120d] dark:hover:bg-brand-strong",
                  )}
                >
                  {pending ? (
                    <>
                      <Loader2 className="size-4 animate-spin" aria-hidden />
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

function Shortcut({
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
      className="group/sc inline-flex h-9 items-center gap-1.5 rounded-full px-2 text-[13px] font-semibold text-foreground-muted no-underline transition hover:bg-brand-wash hover:text-brand"
    >
      <Icon className="size-[1.15rem] text-brand" aria-hidden />
      <span className="hidden sm:inline">{label}</span>
    </Link>
  );
}
