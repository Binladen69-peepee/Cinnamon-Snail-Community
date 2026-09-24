"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import {
  AlertTriangle,
  Check,
  Download,
  ExternalLink,
  Gauge,
  Loader2,
  Lock,
  RotateCcw,
} from "lucide-react";
import type { LessonKind } from "@prisma/client";
import { formatChapterTime, type Chapter } from "@/lib/learn/chapters";
import { cn } from "@/lib/utils";

/**
 * The lesson player.
 *
 * The source is never rendered from props. The page knows which lesson is
 * open; the address of its media is asked for separately, from an endpoint
 * that re-checks entitlement and hands back either a short-lived signed URL or
 * a path back through our own streaming route. That is what keeps a paid video
 * out of the page source, out of "view source", and out of a copied link.
 *
 * Progress is written on a fifteen-second heartbeat, on pause, on ended, and
 * once more with `sendBeacon` when the tab goes away — the last of those being
 * the one that matters, because most lessons end with a closed tab rather than
 * with the video running out. The server keeps the furthest point as a
 * maximum, so two devices cannot undo each other.
 *
 * Every control is a real button in the tab order, and the shortcuts are the
 * ones people already know from other players: space, arrows, `f`, `m`.
 */

type Source =
  | { status: "loading" }
  | {
      status: "ready";
      kind: LessonKind;
      src: string;
      embed: boolean;
      captionsUrl: string | null;
      chapters: Chapter[];
      resumeAt: number;
      completed: boolean;
      liveUrl: string | null;
      liveAt: string | null;
    }
  | { status: "locked"; membership: "expired" | "none" | "active" }
  | { status: "missing" }
  | { status: "error"; message: string };

const SPEEDS = [0.75, 1, 1.25, 1.5, 1.75, 2];
const HEARTBEAT_MS = 15_000;

export function LessonPlayer({
  lessonId,
  kind,
  title,
  poster,
  chapters: initialChapters,
  resumeAt,
  completed,
  onCompleted,
}: {
  lessonId: string;
  kind: LessonKind;
  title: string;
  poster: string | null;
  chapters: Chapter[];
  resumeAt: number;
  completed: boolean;
  /** Told when the lesson first completes, so the page can update around it. */
  onCompleted?: () => void;
}) {
  const [source, setSource] = useState<Source>({ status: "loading" });
  const [speed, setSpeed] = useState(1);
  const [done, setDone] = useState(completed);
  const mediaRef = useRef<HTMLVideoElement | HTMLAudioElement | null>(null);
  const seekedRef = useRef(false);
  const lastSentRef = useRef(0);

  // --- the source -----------------------------------------------------------
  // The fetch lives inside the effect rather than in a callback the effect
  // calls, so nothing sets state synchronously while React is rendering. The
  // retry button bumps `attempt`, which is what re-runs it; the component is
  // mounted fresh per lesson (the page keys it on the lesson id), so the
  // initial "loading" state is already correct.
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    let alive = true;

    void (async () => {
      try {
        const response = await fetch(`/api/learn/playback/${lessonId}`, {
          cache: "no-store",
        });
        const body = await response.json();
        if (!alive) return;

        if (response.ok && body.ok) {
          setSource({ status: "ready", ...body });
        } else if (response.status === 403 && body.error === "entitlement") {
          setSource({ status: "locked", membership: body.membership ?? "none" });
        } else if (response.status === 404) {
          setSource({ status: "missing" });
        } else if (response.status === 429) {
          setSource({
            status: "error",
            message:
              "Too many requests just now. Give it a moment and try again.",
          });
        } else {
          setSource({
            status: "error",
            message: "This lesson would not load. Try again in a moment.",
          });
        }
      } catch {
        if (!alive) return;
        setSource({
          status: "error",
          message:
            "Something went wrong reaching the lesson. Check your connection.",
        });
      }
    })();

    return () => {
      alive = false;
    };
  }, [lessonId, attempt]);

  const retry = useCallback(() => {
    setSource({ status: "loading" });
    setAttempt((value) => value + 1);
  }, []);

  // --- saving where we got to ----------------------------------------------
  const save = useCallback(
    (position: number, duration: number | null, finished: boolean) => {
      const payload = JSON.stringify({
        lessonId,
        positionSeconds: Math.floor(position),
        durationSeconds: duration ? Math.floor(duration) : null,
        completed: finished,
      });
      lastSentRef.current = Date.now();

      // A beacon survives the page going away; fetch does not. Used for every
      // save, not only the last one, because it is also the cheaper of the two.
      if (typeof navigator !== "undefined" && navigator.sendBeacon) {
        const blob = new Blob([payload], { type: "application/json" });
        if (navigator.sendBeacon("/api/learn/progress", blob)) return;
      }
      void fetch("/api/learn/progress", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: payload,
        keepalive: true,
      }).catch(() => undefined);
    },
    [lessonId],
  );

  const saveNow = useCallback(
    (finished = false) => {
      const media = mediaRef.current;
      if (!media) return;
      const position = media.currentTime;
      if (!Number.isFinite(position)) return;
      const duration = Number.isFinite(media.duration) ? media.duration : null;
      save(position, duration, finished);
      if (finished && !done) {
        setDone(true);
        onCompleted?.();
      }
    },
    [done, onCompleted, save],
  );

  useEffect(() => {
    if (source.status !== "ready" || source.embed) return;
    // A tab that is hidden, frozen or closed all arrive here; `visibilitychange`
    // is the only one of the three that fires reliably on iOS.
    function onHide() {
      if (document.visibilityState === "hidden") saveNow();
    }
    function onPageHide() {
      saveNow();
    }
    document.addEventListener("visibilitychange", onHide);
    window.addEventListener("pagehide", onPageHide);
    return () => {
      document.removeEventListener("visibilitychange", onHide);
      window.removeEventListener("pagehide", onPageHide);
    };
  }, [saveNow, source]);

  // --- keyboard -------------------------------------------------------------
  useEffect(() => {
    if (source.status !== "ready" || source.embed) return;
    function onKey(event: KeyboardEvent) {
      const media = mediaRef.current;
      if (!media) return;
      const target = event.target as HTMLElement | null;
      // Never steal a key from something the member is typing into.
      if (
        target &&
        (target.tagName === "INPUT" ||
          target.tagName === "TEXTAREA" ||
          target.isContentEditable)
      ) {
        return;
      }
      switch (event.key) {
        case " ":
        case "k":
          event.preventDefault();
          if (media.paused) void media.play();
          else media.pause();
          break;
        case "ArrowLeft":
          event.preventDefault();
          media.currentTime = Math.max(0, media.currentTime - 10);
          break;
        case "ArrowRight":
          event.preventDefault();
          media.currentTime = media.currentTime + 10;
          break;
        case "m":
          media.muted = !media.muted;
          break;
        case "f":
          if (media instanceof HTMLVideoElement) {
            if (document.fullscreenElement) void document.exitFullscreen();
            else void media.requestFullscreen?.();
          }
          break;
        default:
          break;
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [source]);

  function seekTo(seconds: number) {
    const media = mediaRef.current;
    if (!media) return;
    media.currentTime = seconds;
    void media.play();
  }

  function changeSpeed(next: number) {
    setSpeed(next);
    if (mediaRef.current) mediaRef.current.playbackRate = next;
  }

  // --- states that are not a player ----------------------------------------
  if (source.status === "loading") {
    return (
      <Frame>
        <span className="inline-flex items-center gap-2 text-[13.5px] text-foreground-muted">
          <Loader2 className="size-4 animate-spin" aria-hidden />
          Loading the lesson…
        </span>
      </Frame>
    );
  }

  if (source.status === "locked") {
    return (
      <Frame tone="brand">
        <Lock className="size-6 text-brand-strong" aria-hidden />
        <p className="mt-2 text-[14px] font-bold text-foreground">
          {source.membership === "expired"
            ? "Your membership has run out"
            : "This lesson is for members"}
        </p>
        <p className="mx-auto mt-1 max-w-[42ch] text-[13px] text-foreground-muted">
          {source.membership === "expired"
            ? "Renew and everything you had before comes straight back, including where you got to."
            : "Join to watch the full class. Your progress is kept from the moment you do."}
        </p>
        <a
          href="/membership"
          className="mt-3 inline-flex h-9 items-center rounded-ctl bg-brand-fill px-4 text-[13.5px] font-semibold text-brand-fill-foreground no-underline transition hover:bg-brand-fill-hover"
        >
          {source.membership === "expired" ? "Renew membership" : "See membership"}
        </a>
      </Frame>
    );
  }

  if (source.status === "missing") {
    return (
      <Frame>
        <AlertTriangle className="size-6 text-foreground-muted" aria-hidden />
        <p className="mt-2 text-[14px] font-bold text-foreground">
          Nothing to play here yet
        </p>
        <p className="mx-auto mt-1 max-w-[42ch] text-[13px] text-foreground-muted">
          This lesson has no recording attached. It will appear the moment one
          is.
        </p>
      </Frame>
    );
  }

  if (source.status === "error") {
    return (
      <Frame>
        <AlertTriangle className="size-6 text-danger" aria-hidden />
        <p className="mt-2 text-[14px] font-bold text-foreground">
          That did not load
        </p>
        <p className="mx-auto mt-1 max-w-[42ch] text-[13px] text-foreground-muted">
          {source.message}
        </p>
        <button
          type="button"
          onClick={retry}
          className="mt-3 inline-flex h-9 items-center gap-1.5 rounded-ctl border border-border bg-background px-4 text-[13.5px] font-semibold text-foreground transition hover:border-hairline-firm"
        >
          <RotateCcw className="size-3.5" aria-hidden />
          Try again
        </button>
      </Frame>
    );
  }

  // --- the kinds that are not a media element ------------------------------
  if (kind === "LIVE") {
    const when = source.liveAt ? new Date(source.liveAt) : null;
    return (
      <Frame tone="brand">
        <p className="text-[14px] font-bold text-foreground">Live session</p>
        {when ? (
          <p className="mt-1 text-[13px] text-foreground-muted">
            {when.toLocaleString(undefined, {
              weekday: "long",
              day: "numeric",
              month: "long",
              hour: "numeric",
              minute: "2-digit",
            })}
          </p>
        ) : null}
        {source.liveUrl ? (
          <a
            href={source.liveUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="mt-3 inline-flex h-9 items-center gap-1.5 rounded-ctl bg-brand-fill px-4 text-[13.5px] font-semibold text-brand-fill-foreground no-underline transition hover:bg-brand-fill-hover"
          >
            Join the session
            <ExternalLink className="size-3.5" aria-hidden />
          </a>
        ) : null}
      </Frame>
    );
  }

  if (kind === "DOWNLOAD") {
    return (
      <Frame tone="brand">
        <Download className="size-6 text-brand-strong" aria-hidden />
        <p className="mt-2 text-[14px] font-bold text-foreground">{title}</p>
        <a
          href={source.src}
          target="_blank"
          rel="noopener noreferrer"
          onClick={() => save(0, null, true)}
          className="mt-3 inline-flex h-9 items-center gap-1.5 rounded-ctl bg-brand-fill px-4 text-[13.5px] font-semibold text-brand-fill-foreground no-underline transition hover:bg-brand-fill-hover"
        >
          <Download className="size-3.5" aria-hidden />
          Download
        </a>
      </Frame>
    );
  }

  // --- the player -----------------------------------------------------------
  const chapters = source.chapters.length > 0 ? source.chapters : initialChapters;
  const startAt = source.resumeAt || resumeAt;

  const mediaProps = {
    controls: true,
    playsInline: true,
    preload: "metadata" as const,
    className:
      kind === "AUDIO"
        ? "w-full"
        : "aspect-video w-full rounded-card bg-black object-contain",
    onLoadedMetadata: (event: React.SyntheticEvent<HTMLMediaElement>) => {
      const media = event.currentTarget;
      media.playbackRate = speed;
      // Once only: a resume that re-applied on every metadata event would
      // yank the member back every time the browser re-read the file.
      if (!seekedRef.current && startAt > 2) {
        seekedRef.current = true;
        media.currentTime = startAt;
      }
    },
    onTimeUpdate: () => {
      if (Date.now() - lastSentRef.current >= HEARTBEAT_MS) saveNow();
    },
    onPause: () => saveNow(),
    onEnded: () => saveNow(true),
    onError: () =>
      setSource({
        status: "error",
        message:
          "The recording stopped loading. That usually means the link expired — try again.",
      }),
  };

  return (
    <div className="space-y-2.5">
      <div className={cn(kind === "AUDIO" && "rounded-card bg-surface p-4")}>
        {source.embed ? (
          <iframe
            src={source.src}
            title={title}
            allow="accelerometer; gyroscope; autoplay; encrypted-media; picture-in-picture;"
            allowFullScreen
            className="aspect-video w-full rounded-card border-0 bg-black"
          />
        ) : kind === "AUDIO" ? (
          <audio
            ref={mediaRef as React.RefObject<HTMLAudioElement>}
            src={source.src}
            {...mediaProps}
          />
        ) : (
          <video
            ref={mediaRef as React.RefObject<HTMLVideoElement>}
            src={source.src}
            poster={poster ?? undefined}
            {...mediaProps}
          >
            {/* Only a same-origin track is rendered. A caption file on another
                host needs both CORS on that host and `crossOrigin` here, and
                setting `crossOrigin` would then demand CORS from the video's
                host too — which would break the video to maybe fix the
                subtitles. An uploaded .vtt is served from our own media route
                and works; a pasted external one is skipped rather than
                silently failing mid-playback. */}
            {source.captionsUrl?.startsWith("/") ? (
              <track
                kind="captions"
                src={source.captionsUrl}
                srcLang="en"
                label="English"
                default
              />
            ) : null}
          </video>
        )}
      </div>

      {!source.embed ? (
        <div className="flex flex-wrap items-center gap-2">
          <div className="inline-flex items-center gap-1.5">
            <Gauge className="size-3.5 text-foreground-muted" aria-hidden />
            <label htmlFor="lesson-speed" className="sr-only">
              Playback speed
            </label>
            <select
              id="lesson-speed"
              value={speed}
              onChange={(event) => changeSpeed(Number(event.target.value))}
              className="h-8 rounded-ctl border border-border bg-surface px-2 text-[12.5px] font-semibold text-foreground outline-none focus:border-brand focus:ring-2 focus:ring-brand/25"
            >
              {SPEEDS.map((value) => (
                <option key={value} value={value}>
                  {value}×
                </option>
              ))}
            </select>
          </div>

          {done ? (
            <span className="inline-flex h-8 items-center gap-1.5 rounded-ctl border border-brand/40 px-2.5 text-[12.5px] font-semibold text-brand-strong">
              <Check className="size-3.5" aria-hidden />
              Completed
            </span>
          ) : (
            <button
              type="button"
              onClick={() => saveNow(true)}
              className="inline-flex h-8 items-center gap-1.5 rounded-ctl border border-border bg-surface px-2.5 text-[12.5px] font-semibold text-foreground transition hover:border-hairline-firm"
            >
              <Check className="size-3.5" aria-hidden />
              Mark complete
            </button>
          )}

          {startAt > 2 ? (
            <span className="text-[12px] text-foreground-muted">
              Resumed at {formatChapterTime(startAt)}
            </span>
          ) : null}
        </div>
      ) : null}

      {chapters.length > 0 && !source.embed ? (
        <div className="rounded-card border border-border bg-surface">
          <h2 className="border-b border-border px-3.5 py-2 text-[11px] font-bold uppercase tracking-[0.13em] text-foreground-muted">
            Chapters
          </h2>
          <ul className="max-h-56 overflow-y-auto">
            {chapters.map((chapter) => (
              <li key={chapter.atSeconds}>
                <button
                  type="button"
                  onClick={() => seekTo(chapter.atSeconds)}
                  className="flex w-full items-center gap-3 px-3.5 py-2 text-left transition hover:bg-mint"
                >
                  <span className="shrink-0 font-mono text-[12px] tabular-nums text-brand">
                    {formatChapterTime(chapter.atSeconds)}
                  </span>
                  <span className="min-w-0 flex-1 truncate text-[13.5px] text-foreground">
                    {chapter.title}
                  </span>
                </button>
              </li>
            ))}
          </ul>
        </div>
      ) : null}
    </div>
  );
}

function Frame({
  children,
  tone = "plain",
}: {
  children: React.ReactNode;
  tone?: "plain" | "brand";
}) {
  return (
    <div
      className={cn(
        "grid aspect-video w-full place-content-center rounded-card border px-6 text-center",
        tone === "brand"
          ? "border-brand/25 bg-brand-wash"
          : "border-border bg-surface",
      )}
    >
      <div className="flex flex-col items-center">{children}</div>
    </div>
  );
}
