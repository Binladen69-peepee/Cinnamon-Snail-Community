"use client";

import { useRef, useState } from "react";
import { ImagePlus, Loader2, SendHorizonal, X } from "lucide-react";
import { requestUploadAction } from "@/app/(member)/upload-actions";
import { prepareForUpload, putWithProgress } from "@/lib/uploads/client";
import { IMAGE_ACCEPT, validateUpload } from "@/lib/uploads/policy";
import { Button, Callout, fieldClass } from "@/components/app/ui";

/** A typing ping at most this often, however fast someone types. */
const TYPING_THROTTLE_MS = 3000;
const MAX_LENGTH = 4000;

/**
 * The message composer.
 *
 * Enter sends and Shift+Enter breaks the line, which is what every chat client
 * trains people to expect; the textarea grows to a few lines and then scrolls
 * rather than pushing the conversation off screen.
 *
 * The typing ping is throttled here rather than on the server: the flag expires
 * on its own after a few seconds, so telling the server every keystroke would
 * be thousands of writes to set a boolean that is already true.
 */
export function ThreadComposer({
  conversationId,
  uploadsEnabled,
  error,
  restore,
  onSend,
}: {
  conversationId: string;
  uploadsEnabled: boolean;
  error: string | null;
  /** A draft the server refused, handed back so nobody retypes it. */
  restore: { token: number; body: string; imageUrl: string | null } | null;
  onSend: (body: string, imageUrl: string | null) => void;
}) {
  const [body, setBody] = useState("");
  const [image, setImage] = useState<{ url: string; preview: string } | null>(null);
  const [uploading, setUploading] = useState(false);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const lastPingRef = useRef(0);

  // Adjusted during render rather than in an effect, so the refused text is
  // already in the box on the frame the error appears.
  const [restoredToken, setRestoredToken] = useState(0);
  if (restore && restore.token !== restoredToken) {
    setRestoredToken(restore.token);
    setBody(restore.body);
    if (restore.imageUrl) {
      setImage({ url: restore.imageUrl, preview: restore.imageUrl });
    }
  }

  function ping() {
    const now = Date.now();
    if (now - lastPingRef.current < TYPING_THROTTLE_MS) return;
    lastPingRef.current = now;
    void fetch(`/api/messages/${conversationId}/poll`, { method: "POST" }).catch(
      () => undefined,
    );
  }

  function grow() {
    const node = textareaRef.current;
    if (!node) return;
    node.style.height = "auto";
    node.style.height = `${Math.min(node.scrollHeight, 140)}px`;
  }

  function send() {
    const text = body.trim();
    if ((!text && !image) || uploading) return;
    onSend(text, image?.url ?? null);
    setBody("");
    if (image) URL.revokeObjectURL(image.preview);
    setImage(null);
    requestAnimationFrame(grow);
  }

  async function attach(file: File) {
    setUploadError(null);
    const check = validateUpload({ mimeType: file.type, size: file.size });
    if (!check.ok) {
      setUploadError(check.error);
      return;
    }
    if (!file.type.startsWith("image/")) {
      setUploadError("Only images can be attached to a message.");
      return;
    }

    const preview = URL.createObjectURL(file);
    setUploading(true);
    try {
      const prepared = await prepareForUpload(file);
      const ticket = await requestUploadAction({
        mimeType: prepared.mimeType,
        size: prepared.blob.size,
      });
      if (!ticket.ok) {
        setUploadError(ticket.error);
        URL.revokeObjectURL(preview);
        return;
      }
      await putWithProgress({
        url: ticket.ticket.signedUrl,
        blob: prepared.blob,
        mimeType: prepared.mimeType,
        onProgress: () => undefined,
      });
      setImage({ url: ticket.ticket.readUrl, preview });
    } catch (uploadFailure) {
      URL.revokeObjectURL(preview);
      setUploadError(
        uploadFailure instanceof Error ? uploadFailure.message : "Upload failed.",
      );
    } finally {
      setUploading(false);
    }
  }

  const problem = error ?? uploadError;
  const tooLong = body.length > MAX_LENGTH;

  return (
    <div className="shrink-0 border-t border-border bg-surface px-3 py-3 sm:px-4">
      {/* A refused send or a failed upload. The draft is already back in the
          box, so this only has to say why. */}
      {problem ? (
        <Callout tone="danger" className="mb-2.5 px-3 py-2 text-label">
          {problem}
        </Callout>
      ) : null}

      {image ? (
        <div className="relative mb-2.5 inline-block">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={image.preview}
            alt="Attached"
            className="h-20 w-auto rounded-ctl border border-border bg-default object-cover"
          />
          <button
            type="button"
            onClick={() => {
              URL.revokeObjectURL(image.preview);
              setImage(null);
            }}
            aria-label="Remove image"
            className="absolute -right-2 -top-2 grid size-6 place-items-center rounded-full bg-foreground text-background shadow-e2 transition hover:opacity-85"
          >
            <X className="size-3.5" aria-hidden />
          </button>
        </div>
      ) : null}

      <div className="flex items-end gap-2">
        {uploadsEnabled ? (
          <>
            <input
              ref={fileRef}
              type="file"
              accept={IMAGE_ACCEPT}
              className="sr-only"
              onChange={(event) => {
                const file = event.target.files?.[0];
                if (file) void attach(file);
                event.target.value = "";
              }}
            />
            <Button
              variant="ghost"
              iconOnly
              onClick={() => fileRef.current?.click()}
              disabled={uploading || Boolean(image)}
              aria-label="Attach an image"
            >
              {uploading ? (
                <Loader2 className="size-4 animate-spin" aria-hidden />
              ) : (
                <ImagePlus className="size-[1.125rem]" aria-hidden />
              )}
            </Button>
          </>
        ) : null}

        <textarea
          ref={textareaRef}
          value={body}
          rows={1}
          onChange={(event) => {
            setBody(event.target.value);
            grow();
            ping();
          }}
          onKeyDown={(event) => {
            if (event.key === "Enter" && !event.shiftKey) {
              event.preventDefault();
              send();
            }
          }}
          placeholder="Write a message"
          aria-label="Write a message"
          aria-invalid={tooLong || undefined}
          className={fieldClass({
            multiline: true,
            className: "max-h-35 min-h-9 flex-1 resize-none py-1.75 leading-snug",
          })}
        />

        <Button
          variant="primary"
          iconOnly
          onClick={send}
          disabled={(!body.trim() && !image) || uploading || tooLong}
          aria-label="Send"
        >
          <SendHorizonal className="size-4" aria-hidden />
        </Button>
      </div>

      {tooLong ? (
        <p role="alert" className="mt-1.5 text-caption font-medium text-danger">
          {body.length} of {MAX_LENGTH} characters — trim it before sending.
        </p>
      ) : null}
    </div>
  );
}
