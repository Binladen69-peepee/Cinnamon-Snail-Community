"use client";

import { useRef, useState, useTransition } from "react";
import { ImageIcon, Loader2 } from "lucide-react";
import { setCourseThumbnailAction } from "@/app/admin/courses/actions";
import { requestUploadAction } from "@/app/(member)/upload-actions";
import { prepareForUpload, putWithProgress } from "@/lib/uploads/client";
import { IMAGE_ACCEPT, validateUpload } from "@/lib/uploads/policy";
import { cn } from "@/lib/utils";

/**
 * The thumbnail card from the design: preview, the file rule, Reset and Upload.
 *
 * The design says "Max 10MB file size, only png and jpg files." That number is
 * not repeated here as a string — it is read from the upload policy that
 * actually enforces it, so the copy cannot promise a limit the server refuses.
 */
export function CourseThumbnail({
  slug,
  photo,
  hasOwnCover,
  maxBytes,
  uploadsEnabled,
}: {
  slug: string;
  photo: string | null;
  /** True when the course has its own upload, rather than a matched class still. */
  hasOwnCover: boolean;
  maxBytes: number;
  uploadsEnabled: boolean;
}) {
  const [preview, setPreview] = useState<string | null>(photo);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [, startTransition] = useTransition();
  const fileRef = useRef<HTMLInputElement>(null);

  async function upload(file: File) {
    setError(null);
    const check = validateUpload({ mimeType: file.type, size: file.size });
    if (!check.ok) {
      setError(check.error);
      return;
    }
    if (!file.type.startsWith("image/")) {
      setError("A thumbnail has to be an image.");
      return;
    }

    setBusy(true);
    const objectUrl = URL.createObjectURL(file);
    try {
      const prepared = await prepareForUpload(file);
      const ticket = await requestUploadAction({
        mimeType: prepared.mimeType,
        size: prepared.blob.size,
      });
      if (!ticket.ok) {
        setError(ticket.error);
        URL.revokeObjectURL(objectUrl);
        return;
      }
      await putWithProgress({
        url: ticket.ticket.signedUrl,
        blob: prepared.blob,
        mimeType: prepared.mimeType,
        onProgress: () => undefined,
      });
      setPreview(objectUrl);

      const data = new FormData();
      data.set("slug", slug);
      data.set("coverUrl", ticket.ticket.readUrl);
      startTransition(async () => {
        const result = await setCourseThumbnailAction(data);
        if (!result.ok) setError(result.error);
      });
    } catch (failure) {
      URL.revokeObjectURL(objectUrl);
      setError(failure instanceof Error ? failure.message : "Upload failed.");
    } finally {
      setBusy(false);
    }
  }

  function reset() {
    setError(null);
    const data = new FormData();
    data.set("slug", slug);
    data.set("coverUrl", "");
    startTransition(async () => {
      const result = await setCourseThumbnailAction(data);
      if (result.ok) setPreview(null);
      else setError(result.error);
    });
  }

  const megabytes = Math.round(maxBytes / (1024 * 1024));

  return (
    <section className="overflow-hidden rounded-card border border-border bg-surface">
      <div className="aspect-[16/10] w-full bg-brand-wash">
        {preview ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={preview} alt="" className="size-full object-cover" />
        ) : (
          <span className="grid size-full place-items-center text-brand-strong/40">
            <ImageIcon className="size-8" aria-hidden />
          </span>
        )}
      </div>

      <div className="space-y-2.5 p-3.5">
        <div>
          <h2 className="text-[13.5px] font-bold text-foreground">Thumbnail</h2>
          <p className="mt-0.5 text-[12px] text-foreground-muted">
            Max {megabytes}MB file size, only png and jpg files.
          </p>
          {preview && !hasOwnCover ? (
            <p className="mt-1 text-[11.5px] text-foreground-muted">
              Currently using the still from the class sheet.
            </p>
          ) : null}
        </div>

        {error ? (
          <p role="alert" className="text-[12px] font-semibold text-danger">
            {error}
          </p>
        ) : null}

        {uploadsEnabled ? (
          <>
            <input
              ref={fileRef}
              type="file"
              accept={IMAGE_ACCEPT}
              className="sr-only"
              onChange={(event) => {
                const file = event.target.files?.[0];
                if (file) void upload(file);
                event.target.value = "";
              }}
            />
            <div className="grid grid-cols-2 gap-2">
              <button
                type="button"
                onClick={reset}
                disabled={busy || !hasOwnCover}
                className="h-9 rounded-ctl border border-border bg-background text-[13px] font-semibold text-foreground transition hover:border-hairline-firm disabled:opacity-45"
              >
                Reset
              </button>
              <button
                type="button"
                onClick={() => fileRef.current?.click()}
                disabled={busy}
                className={cn(
                  "inline-flex h-9 items-center justify-center gap-1.5 rounded-ctl text-[13px] font-semibold transition",
                  busy
                    ? "bg-default text-foreground-muted"
                    : "bg-brand-fill text-brand-fill-foreground hover:bg-brand-fill-hover",
                )}
              >
                {busy ? (
                  <>
                    <Loader2 className="size-3.5 animate-spin" aria-hidden />
                    Uploading
                  </>
                ) : (
                  "Upload"
                )}
              </button>
            </div>
          </>
        ) : (
          <p className="text-[12px] text-foreground-muted">
            Uploads are not configured on this deployment.
          </p>
        )}
      </div>
    </section>
  );
}
