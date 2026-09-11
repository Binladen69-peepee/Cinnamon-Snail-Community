"use client";

import { useCallback, useRef, useState } from "react";
import { requestUploadAction } from "@/app/(member)/upload-actions";
import { prepareForUpload, putWithProgress } from "@/lib/uploads/client";
import { kindOf, validateUpload } from "@/lib/uploads/policy";

export type UploadItem = {
  id: string;
  name: string;
  kind: "image" | "video";
  /** Object URL for the local preview. Shown before any bytes are sent. */
  preview: string;
  status: "preparing" | "uploading" | "done" | "error";
  progress: number;
  error?: string;
  /** Set once the object is stored. */
  url?: string;
  width?: number | null;
  height?: number | null;
  mimeType?: string;
  alt?: string;
};

/** What a finished upload contributes to a post. */
export type FinishedAttachment = {
  url: string;
  kind: string;
  mimeType: string;
  width: number | null;
  height: number | null;
  alt?: string;
};

let counter = 0;
const nextId = () => `u${(counter += 1)}-${Date.now().toString(36)}`;

/**
 * Member uploads for the composer.
 *
 * Two things make this feel instant rather than merely fast. The preview comes
 * from `URL.createObjectURL`, so the photo is on screen before a single byte
 * has left the device. And the composer is never blocked — you keep typing
 * while the bytes go, and Post simply waits for anything still in flight.
 *
 * Failures are per file: one photo failing out of four leaves the other three
 * and the draft alone, and offers a retry on just that one.
 */
export function useUploads() {
  const [items, setItems] = useState<UploadItem[]>([]);
  const aborts = useRef(new Map<string, AbortController>());
  // Keep the original File around so a retry does not need the picker again.
  const files = useRef(new Map<string, File>());

  const patch = useCallback((id: string, next: Partial<UploadItem>) => {
    setItems((current) =>
      current.map((item) => (item.id === id ? { ...item, ...next } : item)),
    );
  }, []);

  const run = useCallback(
    async (id: string, file: File) => {
      const controller = new AbortController();
      aborts.current.set(id, controller);
      try {
        patch(id, { status: "preparing", progress: 0, error: undefined });
        const prepared = await prepareForUpload(file);

        const ticket = await requestUploadAction({
          mimeType: prepared.mimeType,
          size: prepared.blob.size,
        });
        if (!ticket.ok) {
          patch(id, { status: "error", error: ticket.error });
          return;
        }

        patch(id, { status: "uploading" });
        await putWithProgress({
          url: ticket.ticket.signedUrl,
          blob: prepared.blob,
          mimeType: prepared.mimeType,
          onProgress: (fraction) => patch(id, { progress: fraction }),
          signal: controller.signal,
        });

        patch(id, {
          status: "done",
          progress: 1,
          url: ticket.ticket.readUrl,
          width: prepared.width,
          height: prepared.height,
          mimeType: prepared.mimeType,
        });
      } catch (error) {
        if (error instanceof DOMException && error.name === "AbortError") return;
        patch(id, {
          status: "error",
          error: error instanceof Error ? error.message : "That upload failed.",
        });
      } finally {
        aborts.current.delete(id);
      }
    },
    [patch],
  );

  const add = useCallback(
    (picked: FileList | File[]) => {
      for (const file of Array.from(picked)) {
        const kind = kindOf(file.type);
        const check = validateUpload({ mimeType: file.type, size: file.size });
        const id = nextId();
        const preview = URL.createObjectURL(file);

        if (!kind || !check.ok) {
          setItems((current) => [
            ...current,
            {
              id,
              name: file.name,
              kind: kind ?? "image",
              preview,
              status: "error",
              progress: 0,
              error: check.ok ? "That file type is not supported." : check.error,
            },
          ]);
          continue;
        }

        files.current.set(id, file);
        setItems((current) => [
          ...current,
          { id, name: file.name, kind, preview, status: "preparing", progress: 0 },
        ]);
        void run(id, file);
      }
    },
    [run],
  );

  const remove = useCallback((id: string) => {
    aborts.current.get(id)?.abort();
    aborts.current.delete(id);
    files.current.delete(id);
    setItems((current) => {
      const found = current.find((item) => item.id === id);
      if (found) URL.revokeObjectURL(found.preview);
      return current.filter((item) => item.id !== id);
    });
  }, []);

  const retry = useCallback(
    (id: string) => {
      const file = files.current.get(id);
      if (file) void run(id, file);
    },
    [run],
  );

  const setAlt = useCallback(
    (id: string, alt: string) => patch(id, { alt }),
    [patch],
  );

  const reset = useCallback(() => {
    for (const controller of aborts.current.values()) controller.abort();
    aborts.current.clear();
    files.current.clear();
    setItems((current) => {
      for (const item of current) URL.revokeObjectURL(item.preview);
      return [];
    });
  }, []);

  const busy = items.some(
    (item) => item.status === "preparing" || item.status === "uploading",
  );

  const attachments: FinishedAttachment[] = items
    .filter((item) => item.status === "done" && item.url)
    .map((item) => ({
      url: item.url!,
      kind: item.kind,
      mimeType: item.mimeType ?? "",
      width: item.width ?? null,
      height: item.height ?? null,
      alt: item.alt,
    }));

  return { items, add, remove, retry, setAlt, reset, busy, attachments };
}
