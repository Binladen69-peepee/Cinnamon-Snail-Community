"use client";

import { useRef, useState, useTransition } from "react";
import { AlertCircle, ImageIcon, Loader2, Upload } from "lucide-react";
import { setCourseThumbnailAction } from "@/app/admin/courses/actions";
import { requestUploadAction } from "@/app/(member)/upload-actions";
import { prepareForUpload, putWithProgress } from "@/lib/uploads/client";
import { IMAGE_ACCEPT, validateUpload } from "@/lib/uploads/policy";
import { Button, Card } from "@/components/app/ui";
import { servableImageUrl } from "@/lib/media/servable-image";

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
    <Card padding="none" className="overflow-hidden">
      <div className="relative aspect-16/10 w-full border-b border-separator bg-surface-muted">
        {preview ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={servableImageUrl(preview, 800)} alt="" className="size-full object-cover" />
        ) : (
          <span className="grid size-full place-items-center text-foreground-muted">
            <ImageIcon className="size-8" aria-hidden />
          </span>
        )}
        {busy ? (
          <span className="absolute inset-0 grid place-items-center bg-black/35 text-white">
            <Loader2 className="size-6 animate-spin" aria-hidden />
          </span>
        ) : null}
      </div>

      <div className="flex flex-col gap-3 p-4">
        <div>
          <h2 className="text-body font-semibold text-foreground">Thumbnail</h2>
          <p className="mt-0.5 text-caption text-foreground-muted">
            Max {megabytes}MB file size, only png and jpg files.
          </p>
          {preview && !hasOwnCover ? (
            <p className="mt-1 text-caption text-foreground-muted">
              Currently using the still from the class sheet.
            </p>
          ) : null}
        </div>

        {error ? (
          <p
            role="alert"
            className="flex items-start gap-1.5 text-caption font-medium text-danger"
          >
            <AlertCircle className="mt-px size-3.5 shrink-0" aria-hidden />
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
              <Button onClick={reset} disabled={busy || !hasOwnCover}>
                Reset
              </Button>
              <Button
                variant="primary"
                onClick={() => fileRef.current?.click()}
                disabled={busy}
                aria-busy={busy || undefined}
              >
                {busy ? (
                  <>
                    <Loader2 className="size-4 animate-spin" aria-hidden />
                    Uploading
                  </>
                ) : (
                  <>
                    <Upload className="size-4" aria-hidden />
                    Upload
                  </>
                )}
              </Button>
            </div>
          </>
        ) : (
          <p className="rounded-ctl bg-surface-muted px-3 py-2 text-caption text-foreground-muted">
            Uploads are not configured on this deployment.
          </p>
        )}
      </div>
    </Card>
  );
}
