"use client";

import { useId, useRef, useState } from "react";
import { Loader2, Paperclip, X } from "lucide-react";
import { requestUploadAction } from "@/app/(member)/upload-actions";
import { prepareForUpload, putWithProgress } from "@/lib/uploads/client";
import { VIDEO_ACCEPT, formatBytes, validateUpload } from "@/lib/uploads/policy";
import { Button, Field, Input, ProgressBar } from "@/components/app/ui";

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
  const inputId = useId();
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
    <Field
      label={label}
      htmlFor={inputId}
      error={error}
      hint={
        help ? (
          <>
            {help}{" "}
            {uploadsEnabled ? `Uploads up to ${formatBytes(maxBytes)}.` : null}
          </>
        ) : undefined
      }
      className="min-w-0"
    >
      <div className="flex min-w-0 gap-2">
        <Input
          id={inputId}
          type="text"
          name={name}
          value={current}
          onChange={(event) => setCurrent(event.target.value)}
          placeholder={placeholder}
          spellCheck={false}
          className="flex-1"
        />

        {current ? (
          <Button
            variant="ghost"
            iconOnly
            onClick={() => setCurrent("")}
            aria-label={`Clear ${label}`}
            title={`Clear ${label}`}
          >
            <X className="size-4" aria-hidden />
          </Button>
        ) : null}

        {uploadsEnabled ? (
          <Button
            onClick={() => fileRef.current?.click()}
            disabled={busy}
            aria-busy={busy || undefined}
          >
            {busy ? (
              <>
                <Loader2 className="size-4 animate-spin" aria-hidden />
                {progress > 0 ? `${Math.round(progress * 100)}%` : "Uploading"}
              </>
            ) : (
              <>
                <Paperclip className="size-4" aria-hidden />
                Upload
              </>
            )}
          </Button>
        ) : null}
      </div>

      {busy ? (
        <ProgressBar
          value={Math.round(progress * 100)}
          label={`Uploading ${label}`}
          size="sm"
        />
      ) : null}

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
    </Field>
  );
}
