"use client";

import { useRef, useState } from "react";
import { Loader2, Paperclip, X } from "lucide-react";
import { requestUploadAction } from "@/app/(member)/upload-actions";
import { prepareForUpload, putWithProgress } from "@/lib/uploads/client";
import { VIDEO_ACCEPT, formatBytes, validateUpload } from "@/lib/uploads/policy";
import { cn } from "@/lib/utils";

/**
 * Where a lesson's media comes from: an upload, or an address.
 *
 * Both are needed and neither is enough on its own. Adam's catalog is already
 * hosted elsewhere, so pasting a link has to work or half the library could
 * never be attached; and a new lesson recorded on a phone has to be uploadable
 * or the admin has to go and find a host first.
 *
 * The value is a hidden input, so the whole form is still an ordinary
 * `FormData` POST to a server action — nothing here is load-bearing for
 * saving. The server re-checks every path against storage regardless of what
 * this component decides.
 */
export function MediaField({
  name,
  label,
  help,
  value,
  accept = VIDEO_ACCEPT,
  maxBytes,
  uploadsEnabled,
  placeholder = "Paste a link, or upload a file",
}: {
  name: string;
  label: string;
  help?: string;
  value: string | null;
  accept?: string;
  maxBytes: number;
  uploadsEnabled: boolean;
  placeholder?: string;
}) {
  const [current, setCurrent] = useState(value ?? "");
  const [busy, setBusy] = useState(false);
  const [progress, setProgress] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  async function upload(file: File) {
    setError(null);
    const check = validateUpload({ mimeType: file.type, size: file.size });
    if (!check.ok) {
      setError(check.error);
      return;
    }

    setBusy(true);
    setProgress(0);
    try {
      const prepared = await prepareForUpload(file);
      const ticket = await requestUploadAction({
        mimeType: prepared.mimeType,
        size: prepared.blob.size,
      });
      if (!ticket.ok) {
        setError(ticket.error);
        return;
      }
      await putWithProgress({
        url: ticket.ticket.signedUrl,
        blob: prepared.blob,
        mimeType: prepared.mimeType,
        onProgress: setProgress,
      });
      setCurrent(ticket.ticket.readUrl);
    } catch (failure) {
      setError(failure instanceof Error ? failure.message : "Upload failed.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="min-w-0">
      <span className="mb-1.5 block text-[12.5px] font-semibold text-foreground">
        {label}
      </span>

      <div className="flex gap-2">
        <input
          type="text"
          name={name}
          value={current}
          onChange={(event) => setCurrent(event.target.value)}
          placeholder={placeholder}
          spellCheck={false}
          className="h-9 min-w-0 flex-1 rounded-ctl border border-field-border bg-field-background px-3 text-[13px] text-foreground outline-none transition placeholder:text-field-placeholder focus:border-brand focus:ring-2 focus:ring-brand/25"
        />

        {current ? (
          <button
            type="button"
            onClick={() => setCurrent("")}
            aria-label={`Clear ${label}`}
            className="grid size-9 shrink-0 place-items-center rounded-ctl border border-border bg-background text-foreground-muted transition hover:border-hairline-firm hover:text-foreground"
          >
            <X className="size-4" aria-hidden />
          </button>
        ) : null}

        {uploadsEnabled ? (
          <button
            type="button"
            onClick={() => fileRef.current?.click()}
            disabled={busy}
            className={cn(
              "inline-flex h-9 shrink-0 items-center gap-1.5 rounded-ctl border border-border bg-background px-3 text-[12.5px] font-semibold text-foreground transition hover:border-hairline-firm",
              busy && "opacity-60",
            )}
          >
            {busy ? (
              <>
                <Loader2 className="size-3.5 animate-spin" aria-hidden />
                {progress > 0 ? `${Math.round(progress * 100)}%` : "Uploading"}
              </>
            ) : (
              <>
                <Paperclip className="size-3.5" aria-hidden />
                Upload
              </>
            )}
          </button>
        ) : null}
      </div>

      <input
        ref={fileRef}
        type="file"
        accept={accept}
        className="sr-only"
        onChange={(event) => {
          const file = event.target.files?.[0];
          if (file) void upload(file);
          event.target.value = "";
        }}
      />

      {error ? (
        <p role="alert" className="mt-1.5 text-[12px] font-semibold text-danger">
          {error}
        </p>
      ) : help ? (
        <p className="mt-1.5 text-[12px] text-foreground-muted">
          {help}{" "}
          {uploadsEnabled ? `Uploads up to ${formatBytes(maxBytes)}.` : null}
        </p>
      ) : null}
    </div>
  );
}
