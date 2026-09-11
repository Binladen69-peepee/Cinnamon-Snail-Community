"use client";

import { AlertTriangle, Check, Loader2, RotateCcw, X } from "lucide-react";
import type { UploadItem } from "@/components/feed/use-uploads";
import { cn } from "@/lib/utils";

/**
 * The attachment tray under the composer.
 *
 * Every tile shows the real file from the moment it is picked, because the
 * preview is a local object URL and needs no network at all. A determinate bar
 * covers the upload, a tick confirms it, and a failure offers a retry on that
 * one file without touching the draft or the others.
 */
export function UploadTray({
  items,
  onRemove,
  onRetry,
  onAlt,
}: {
  items: UploadItem[];
  onRemove: (id: string) => void;
  onRetry: (id: string) => void;
  onAlt: (id: string, alt: string) => void;
}) {
  if (items.length === 0) return null;

  return (
    <ul className="mt-2.5 grid grid-cols-[repeat(auto-fill,minmax(5.5rem,1fr))] gap-2">
      {items.map((item) => {
        const pending = item.status === "preparing" || item.status === "uploading";
        const percent = Math.round(item.progress * 100);
        return (
          <li
            key={item.id}
            className={cn(
              "group/tile relative aspect-square overflow-hidden rounded-ctl border bg-mint/40",
              item.status === "error" ? "border-danger/60" : "border-border",
            )}
          >
            {item.kind === "video" ? (
               
              <video
                src={item.preview}
                muted
                playsInline
                preload="metadata"
                className="size-full object-cover"
              />
            ) : (
              // A local object URL, not a remote host.
              // eslint-disable-next-line @next/next/no-img-element
              <img src={item.preview} alt="" className="size-full object-cover" />
            )}

            {pending ? (
              <div className="absolute inset-0 grid place-items-center bg-[rgba(9,20,16,0.55)]">
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
                  className="absolute right-1 top-1 grid size-4.5 place-items-center rounded-full bg-brand text-[#06120d]"
                  aria-hidden
                >
                  <Check className="size-3" />
                </span>
                {/* Alt text, because a feed of food photos with no descriptions
                    is unusable with a screen reader. */}
                {item.kind === "image" ? (
                  <input
                    value={item.alt ?? ""}
                    onChange={(event) => onAlt(item.id, event.currentTarget.value)}
                    placeholder="Describe it"
                    aria-label={`Description for ${item.name}`}
                    className="absolute inset-x-0 bottom-0 h-6 w-full border-0 bg-[rgba(9,20,16,0.66)] px-1.5 text-[10.5px] text-white outline-none placeholder:text-white/60 focus:bg-[rgba(9,20,16,0.85)]"
                  />
                ) : null}
              </>
            ) : null}

            {item.status === "error" ? (
              <div className="absolute inset-0 flex flex-col items-center justify-center gap-1 bg-[rgba(9,20,16,0.72)] px-1.5 text-center">
                <AlertTriangle className="size-4 text-danger" aria-hidden />
                <p className="line-clamp-3 text-[10px] leading-tight text-white/90">
                  {item.error}
                </p>
                <button
                  type="button"
                  onClick={() => onRetry(item.id)}
                  className="mt-0.5 inline-flex items-center gap-1 rounded-full bg-white/90 px-1.5 py-0.5 text-[10px] font-bold text-forest"
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
              className="absolute left-1 top-1 grid size-4.5 place-items-center rounded-full bg-[rgba(9,20,16,0.7)] text-white opacity-0 transition group-hover/tile:opacity-100 focus-visible:opacity-100"
            >
              <X className="size-3" aria-hidden />
            </button>
          </li>
        );
      })}
    </ul>
  );
}
