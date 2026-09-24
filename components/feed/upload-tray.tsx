"use client";

import { useRef } from "react";
import { AlertTriangle, Check, ImagePlus, Loader2, RotateCcw, X } from "lucide-react";
import type { UploadItem } from "@/components/feed/use-uploads";
import { IMAGE_ACCEPT } from "@/lib/uploads/policy";
import { cn } from "@/lib/utils";

/**
 * The attachment tray under the composer.
 *
 * Every tile shows the real file from the moment it is picked, because the
 * preview is a local object URL and needs no network at all. A determinate bar
 * covers the upload, a tick confirms it, and a failure offers a retry on that
 * one file without touching the draft or the others.
 *
 * Videos may take an optional thumbnail image so the feed can show a still
 * before play instead of a blank first frame.
 */
export function UploadTray({
  items,
  onRemove,
  onRetry,
  onAlt,
  onVideoThumbnail,
  onClearVideoThumbnail,
}: {
  items: UploadItem[];
  onRemove: (id: string) => void;
  onRetry: (id: string) => void;
  onAlt: (id: string, alt: string) => void;
  onVideoThumbnail?: (id: string, file: File) => void;
  onClearVideoThumbnail?: (id: string) => void;
}) {
  if (items.length === 0) return null;

  return (
    <ul className="mt-2.5 grid grid-cols-[repeat(auto-fill,minmax(5.5rem,1fr))] gap-2">
      {items.map((item) => (
        <UploadTile
          key={item.id}
          item={item}
          onRemove={onRemove}
          onRetry={onRetry}
          onAlt={onAlt}
          onVideoThumbnail={onVideoThumbnail}
          onClearVideoThumbnail={onClearVideoThumbnail}
        />
      ))}
    </ul>
  );
}

function UploadTile({
  item,
  onRemove,
  onRetry,
  onAlt,
  onVideoThumbnail,
  onClearVideoThumbnail,
}: {
  item: UploadItem;
  onRemove: (id: string) => void;
  onRetry: (id: string) => void;
  onAlt: (id: string, alt: string) => void;
  onVideoThumbnail?: (id: string, file: File) => void;
  onClearVideoThumbnail?: (id: string) => void;
}) {
  const thumbRef = useRef<HTMLInputElement>(null);
  const pending = item.status === "preparing" || item.status === "uploading";
  const percent = Math.round(item.progress * 100);
  const poster = item.thumbnailPreview ?? item.thumbnailUrl;

  return (
    <li
      className={cn(
        "group/tile relative aspect-square overflow-hidden rounded-ctl border bg-mint/40",
        item.status === "error" ? "border-danger/60" : "border-border",
      )}
    >
      {item.kind === "video" ? (
        poster ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={poster} alt="" className="size-full object-cover" />
        ) : (
          <video
            src={item.preview}
            muted
            playsInline
            preload="metadata"
            className="size-full object-cover"
          />
        )
      ) : (
        // A local object URL, not a remote host.
        // eslint-disable-next-line @next/next/no-img-element
        <img src={item.preview} alt="" className="size-full object-cover" />
      )}

      {pending ? (
        <div className="absolute inset-0 grid place-items-center bg-[rgba(0,0,0,0.55)]">
          <span className="text-[11.5px] font-bold tabular-nums text-white">
            {item.status === "preparing" ? (
              <Loader2 className="size-4 animate-spin" aria-hidden />
            ) : (
              `${percent}%`
            )}
          </span>
          <span className="absolute inset-x-0 bottom-0 h-[3px] bg-white/25" aria-hidden>
            <span
              className="block h-full bg-white transition-[width] duration-150"
              style={{ width: `${percent}%` }}
            />
          </span>
          <span className="sr-only">
            {item.name}: {percent}% uploaded
          </span>
        </div>
      ) : null}

      {item.status === "done" ? (
        <>
          <span
            className="absolute right-1 top-1 grid size-4.5 place-items-center rounded-full bg-brand text-on-brand"
            aria-hidden
          >
            <Check className="size-3" />
          </span>
          {item.kind === "image" ? (
            <input
              value={item.alt ?? ""}
              onChange={(event) => onAlt(item.id, event.currentTarget.value)}
              placeholder="Describe it"
              aria-label={`Description for ${item.name}`}
              className="absolute inset-x-0 bottom-0 h-6 w-full border-0 bg-[rgba(0,0,0,0.66)] px-1.5 text-[10.5px] text-white outline-none placeholder:text-white/60 focus:bg-[rgba(0,0,0,0.85)]"
            />
          ) : null}
          {item.kind === "video" && onVideoThumbnail ? (
            <div className="absolute inset-x-0 bottom-0 flex gap-0.5 p-0.5">
              <button
                type="button"
                onClick={() => thumbRef.current?.click()}
                className="flex flex-1 items-center justify-center gap-0.5 rounded-[6px] bg-[rgba(0,0,0,0.72)] px-1 py-1 text-[9.5px] font-semibold text-white"
              >
                {item.thumbnailStatus === "preparing" ||
                item.thumbnailStatus === "uploading" ? (
                  <Loader2 className="size-2.5 animate-spin" aria-hidden />
                ) : (
                  <ImagePlus className="size-2.5" aria-hidden />
                )}
                {poster ? "Change" : "Thumb"}
              </button>
              {poster && onClearVideoThumbnail ? (
                <button
                  type="button"
                  onClick={() => onClearVideoThumbnail(item.id)}
                  aria-label="Remove thumbnail"
                  className="rounded-[6px] bg-[rgba(0,0,0,0.72)] px-1.5 text-[9.5px] font-semibold text-white"
                >
                  ✕
                </button>
              ) : null}
              <input
                ref={thumbRef}
                type="file"
                accept={IMAGE_ACCEPT}
                className="sr-only"
                onChange={(event) => {
                  const file = event.currentTarget.files?.[0];
                  event.currentTarget.value = "";
                  if (file) onVideoThumbnail(item.id, file);
                }}
              />
            </div>
          ) : null}
        </>
      ) : null}

      {item.status === "error" ? (
        <div className="absolute inset-0 flex flex-col items-center justify-center gap-1 bg-[rgba(0,0,0,0.72)] px-1.5 text-center">
          <AlertTriangle className="size-4 text-danger" aria-hidden />
          <p className="line-clamp-3 text-[10px] leading-tight text-white/90">
            {item.error}
          </p>
          <button
            type="button"
            onClick={() => onRetry(item.id)}
            className="mt-0.5 inline-flex items-center gap-1 rounded-full bg-white/90 px-1.5 py-0.5 text-[10px] font-bold text-black"
          >
            <RotateCcw className="size-2.5" aria-hidden />
            Retry
          </button>
        </div>
      ) : null}

      <button
        type="button"
        onClick={() => onRemove(item.id)}
        aria-label={`Remove ${item.name}`}
        className="absolute left-1 top-1 grid size-4.5 place-items-center rounded-full bg-[rgba(0,0,0,0.7)] text-white opacity-0 transition group-hover/tile:opacity-100 focus-visible:opacity-100"
      >
        <X className="size-3" aria-hidden />
      </button>
    </li>
  );
}
