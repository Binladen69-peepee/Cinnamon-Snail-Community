"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { CheckCircle2, Film, Library, Loader2, Search, TriangleAlert, Upload, X } from "lucide-react";
import {
  bunnyVideoStatusAction,
  listBunnyLibraryAction,
  startBunnyUploadAction,
  type LibraryRow,
} from "@/app/admin/videos/actions";
import { uploadToBunny } from "@/lib/bunny/tus-upload";
import { Badge, Button, Callout, fieldClass, ProgressBar } from "@/components/app/ui";

/**
 * A lesson's Bunny Stream video (DEC-081): upload one, pick one from the
 * library, or paste its id. Writes the id into a hidden input the lesson form
 * submits; the server checks it against the library again before saving.
 *
 * Uploads go straight from this browser to Bunny over TUS with a one-video
 * signature, so a large class never passes through our server and the API key
 * never reaches the page. After the upload Bunny encodes the video; this polls
 * its status until it is ready, so staff know when members can watch it.
 */

type State = "uploading" | "processing" | "ready" | "failed";

type Current = {
  id: string;
  title: string | null;
  state: State | null;
  length: number | null;
  encodeProgress: number | null;
};

function stateFromStatus(status: number | null | undefined): State | null {
  if (status === null || status === undefined) return null;
  if (status === 4) return "ready";
  if (status === 5 || status === 6) return "failed";
  if (status === 0) return "uploading";
  return "processing";
}

function formatLength(seconds: number | null) {
  if (!seconds || seconds <= 0) return null;
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = seconds % 60;
  return h > 0 ? `${h}:${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}` : `${m}:${String(s).padStart(2, "0")}`;
}

const STATE_BADGE: Record<State, { tone: "success" | "warning" | "danger" | "neutral"; label: string }> = {
  ready: { tone: "success", label: "Ready to watch" },
  processing: { tone: "warning", label: "Processing" },
  uploading: { tone: "neutral", label: "Waiting for upload" },
  failed: { tone: "danger", label: "Failed" },
};

export function BunnyVideoField({
  name,
  initial,
  lessonTitle,
  configured,
  signed,
}: {
  name: string;
  initial: { id: string | null; status: number | null; length: number | null };
  lessonTitle: string;
  /** Bunny's library id and API key are set. */
  configured: boolean;
  /** The token key is set, so playback URLs are signed. */
  signed: boolean;
}) {
  const [current, setCurrent] = useState<Current | null>(
    initial.id
      ? {
          id: initial.id,
          title: null,
          state: stateFromStatus(initial.status),
          length: initial.length,
          encodeProgress: null,
        }
      : null,
  );
  const [mode, setMode] = useState<"idle" | "library" | "paste">("idle");
  const [upload, setUpload] = useState<{ fraction: number; name: string } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const abortRef = useRef<AbortController | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  // Ask Bunny how the video is doing: once on open, then every five seconds
  // while it is still uploading or encoding.
  const currentId = current?.id ?? null;
  const settled = current?.state === "ready" || current?.state === "failed";
  useEffect(() => {
    if (!currentId || upload) return;
    let alive = true;
    let timer: ReturnType<typeof setTimeout> | null = null;
    async function poll() {
      const result = await bunnyVideoStatusAction(currentId!);
      if (!alive) return;
      if (result.ok) {
        setCurrent((previous) =>
          previous && previous.id === currentId
            ? {
                ...previous,
                title: result.video.title || previous.title,
                state: result.video.state,
                length: result.video.length || previous.length,
                encodeProgress: result.video.encodeProgress,
              }
            : previous,
        );
        if (result.video.state !== "ready" && result.video.state !== "failed") {
          timer = setTimeout(poll, 5000);
        }
      }
    }
    if (!settled) void poll();
    else if (current?.title === null) void poll();
    return () => {
      alive = false;
      if (timer) clearTimeout(timer);
    };
    // `current.title` is read only to decide whether the first poll is needed.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentId, settled, upload]);

  async function onFile(file: File) {
    setError(null);
    if (!file.type.startsWith("video/")) {
      setError("That file is not a video.");
      return;
    }
    const started = await startBunnyUploadAction({ title: lessonTitle || file.name });
    if (!started.ok) {
      setError(started.error);
      return;
    }
    const controller = new AbortController();
    abortRef.current = controller;
    setUpload({ fraction: 0, name: file.name });
    setCurrent({ id: started.video.guid, title: started.video.title, state: "uploading", length: null, encodeProgress: null });
    try {
      await uploadToBunny(started.ticket, file, (fraction) => setUpload({ fraction, name: file.name }), controller.signal);
      setCurrent((previous) => (previous ? { ...previous, state: "processing" } : previous));
    } catch (failure) {
      const canceled = failure instanceof DOMException && failure.name === "AbortError";
      setError(canceled ? "Upload canceled." : failure instanceof Error ? failure.message : "The upload failed.");
      setCurrent(initial.id ? { id: initial.id, title: null, state: stateFromStatus(initial.status), length: initial.length, encodeProgress: null } : null);
    } finally {
      abortRef.current = null;
      setUpload(null);
    }
  }

  if (!configured) {
    return (
      <Callout tone="warning" title="Bunny Stream is not configured">
        Set BUNNY_STREAM_LIBRARY_ID and BUNNY_STREAM_API_KEY to upload lesson videos to Bunny.
      </Callout>
    );
  }

  const badge = current?.state ? STATE_BADGE[current.state] : null;

  return (
    <div className="flex flex-col gap-3">
      <input type="hidden" name={name} value={current?.id ?? ""} />

      {!signed ? (
        <Callout tone="warning" title="Playback is not signed yet">
          Members will not be able to play Bunny videos until BUNNY_STREAM_TOKEN_KEY is set and token
          authentication is switched on for the library. Until then a lesson with an older video
          source keeps playing that one.
        </Callout>
      ) : null}

      {current ? (
        <div className="flex items-start gap-3 rounded-ctl border border-border bg-surface-muted p-3">
          <span className="grid size-10 shrink-0 place-items-center rounded-ctl bg-brand-wash text-on-brand-wash" aria-hidden>
            <Film className="size-5" />
          </span>
          <div className="min-w-0 flex-1">
            <p className="truncate text-label font-semibold text-foreground">
              {current.title || "Bunny video"}
            </p>
            <p className="mt-0.5 flex flex-wrap items-center gap-2 text-caption text-foreground-muted">
              {badge ? <Badge tone={badge.tone}>{badge.label}</Badge> : null}
              {current.state === "processing" && current.encodeProgress ? (
                <span className="tabular-nums">{current.encodeProgress}% encoded</span>
              ) : null}
              {formatLength(current.length) ? <span className="tabular-nums">{formatLength(current.length)}</span> : null}
              <code className="truncate font-mono text-micro">{current.id}</code>
            </p>
            {upload ? (
              <div className="mt-2">
                <ProgressBar value={Math.round(upload.fraction * 100)} label={`Uploading ${upload.name}`} showValue size="sm" />
              </div>
            ) : null}
          </div>
          {upload ? (
            <Button size="sm" variant="ghost" onClick={() => abortRef.current?.abort()}>
              Cancel
            </Button>
          ) : (
            <Button size="sm" variant="ghost" iconOnly aria-label="Remove the video from this lesson" onClick={() => setCurrent(null)}>
              <X className="size-4" aria-hidden />
            </Button>
          )}
        </div>
      ) : null}

      {!upload ? (
        <div className="flex flex-wrap gap-2">
          <Button size="sm" onClick={() => fileRef.current?.click()}>
            <Upload className="size-4" aria-hidden />
            {current ? "Upload a replacement" : "Upload to Bunny"}
          </Button>
          <Button size="sm" variant={mode === "library" ? "primary" : "secondary"} onClick={() => setMode(mode === "library" ? "idle" : "library")}>
            <Library className="size-4" aria-hidden />
            Choose from library
          </Button>
          <Button size="sm" variant="ghost" onClick={() => setMode(mode === "paste" ? "idle" : "paste")}>
            Paste an id
          </Button>
          <input
            ref={fileRef}
            type="file"
            accept="video/*"
            className="sr-only"
            tabIndex={-1}
            onChange={(event) => {
              const file = event.target.files?.[0];
              event.target.value = "";
              if (file) void onFile(file);
            }}
          />
        </div>
      ) : null}

      {mode === "paste" && !upload ? (
        <PasteId
          onPick={(id) => {
            setCurrent({ id, title: null, state: null, length: null, encodeProgress: null });
            setMode("idle");
          }}
        />
      ) : null}

      {mode === "library" && !upload ? (
        <LibraryPicker
          onPick={(row) => {
            setCurrent({ id: row.guid, title: row.title, state: row.state, length: row.length, encodeProgress: row.encodeProgress });
            setMode("idle");
          }}
        />
      ) : null}

      {error ? (
        <p role="alert" className="flex items-center gap-1.5 text-caption font-medium text-danger">
          <TriangleAlert className="size-3.5" aria-hidden />
          {error}
        </p>
      ) : null}
    </div>
  );
}

function PasteId({ onPick }: { onPick: (id: string) => void }) {
  const [value, setValue] = useState("");
  const valid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value.trim());
  return (
    <div className="flex gap-2">
      <input
        value={value}
        onChange={(event) => setValue(event.target.value)}
        placeholder="Bunny video id, e.g. 3f0b5f9e-…"
        aria-label="Bunny video id"
        className={fieldClass({ size: "sm", className: "font-mono" })}
      />
      <Button size="sm" variant="primary" disabled={!valid} onClick={() => onPick(value.trim().toLowerCase())}>
        Use it
      </Button>
    </div>
  );
}

function LibraryPicker({ onPick }: { onPick: (row: LibraryRow) => void }) {
  const [search, setSearch] = useState("");
  const [rows, setRows] = useState<LibraryRow[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  useEffect(() => {
    const timer = setTimeout(() => {
      startTransition(async () => {
        const result = await listBunnyLibraryAction({ search });
        if (result.ok) {
          setRows(result.items);
          setError(null);
        } else {
          setError(result.error);
        }
      });
    }, 250);
    return () => clearTimeout(timer);
  }, [search]);

  return (
    <div className="rounded-ctl border border-border bg-surface">
      <div className="relative border-b border-separator p-2">
        <Search className="pointer-events-none absolute left-4 top-1/2 size-4 -translate-y-1/2 text-foreground-muted" aria-hidden />
        <input
          value={search}
          onChange={(event) => setSearch(event.target.value)}
          placeholder="Search the video library"
          aria-label="Search the video library"
          className={fieldClass({ size: "sm", className: "pl-8" })}
        />
      </div>
      <div className="max-h-72 overflow-y-auto">
        {error ? (
          <p className="p-3 text-caption text-danger">{error}</p>
        ) : rows === null || (pending && rows.length === 0) ? (
          <p className="flex items-center gap-2 p-3 text-caption text-foreground-muted">
            <Loader2 className="size-3.5 animate-spin" aria-hidden />
            Loading the library…
          </p>
        ) : rows.length === 0 ? (
          <p className="p-3 text-caption text-foreground-muted">No videos match. Upload one instead.</p>
        ) : (
          <ul className="divide-y divide-separator">
            {rows.map((row) => (
              <li key={row.guid}>
                <button
                  type="button"
                  onClick={() => onPick(row)}
                  className="flex w-full items-center gap-3 px-3 py-2.5 text-left transition hover:bg-surface-muted"
                >
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-label font-medium text-foreground">{row.title || row.guid}</span>
                    <span className="mt-0.5 flex flex-wrap items-center gap-2 text-caption text-foreground-muted">
                      {formatLength(row.length) ? <span className="tabular-nums">{formatLength(row.length)}</span> : null}
                      {row.lessons.length > 0 ? (
                        <span>Used by {row.lessons.length === 1 ? row.lessons[0]!.title : `${row.lessons.length} lessons`}</span>
                      ) : (
                        <span>Not used yet</span>
                      )}
                    </span>
                  </span>
                  {row.state === "ready" ? (
                    <CheckCircle2 className="size-4 shrink-0 text-success" aria-label="Ready" />
                  ) : (
                    <Badge tone={row.state === "failed" ? "danger" : "warning"}>{STATE_BADGE[row.state].label}</Badge>
                  )}
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
