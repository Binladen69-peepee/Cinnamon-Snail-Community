"use client";

import { useEffect, useRef, useState } from "react";
import { saveProgressAction } from "@/app/(member)/learn/actions";

export function LessonPlayer({
  lessonId,
  startSeconds,
  captionsUrl,
}: {
  lessonId: string;
  startSeconds: number;
  captionsUrl: string | null;
}) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const [src, setSrc] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    fetch(`/api/learn/playback/${lessonId}`)
      .then(async (response) => {
        const data = (await response.json()) as { ok: boolean; src?: string; error?: string };
        if (!response.ok || !data.src) {
          throw new Error(data.error === "entitlement" ? "entitlement" : "playback");
        }
        if (!cancelled) setSrc(data.src);
      })
      .catch((err: Error) => {
        if (!cancelled) {
          setError(err.message === "entitlement" ? "entitlement" : "playback");
        }
      });
    return () => {
      cancelled = true;
    };
  }, [lessonId]);

  useEffect(() => {
    const node = videoRef.current;
    if (!node || startSeconds <= 0) return;
    const onLoaded = () => {
      if (Math.abs(node.currentTime - startSeconds) > 1) node.currentTime = startSeconds;
    };
    node.addEventListener("loadedmetadata", onLoaded);
    return () => node.removeEventListener("loadedmetadata", onLoaded);
  }, [src, startSeconds]);

  useEffect(() => {
    const node = videoRef.current;
    if (!node) return;
    const timer = window.setInterval(() => {
      const form = new FormData();
      form.set("lessonId", lessonId);
      form.set("positionSeconds", String(Math.floor(node.currentTime)));
      form.set("completed", node.ended ? "true" : "false");
      void saveProgressAction(form);
    }, 15000);
    return () => window.clearInterval(timer);
  }, [lessonId, src]);

  if (error === "entitlement") {
    return (
      <p className="rounded-[20px] border border-sand bg-warm-white px-4 py-6 text-sm text-foreground-muted">
        Playback stays behind an active membership entitlement.
      </p>
    );
  }
  if (error) {
    return (
      <p className="rounded-[20px] border border-sand bg-warm-white px-4 py-6 text-sm text-foreground-muted">
        This lesson could not start. Refresh, or check that Stream is configured for paid video.
      </p>
    );
  }
  if (!src) {
    return <div className="aspect-video animate-pulse rounded-[20px] bg-sage" />;
  }

  return (
    <video
      ref={videoRef}
      className="aspect-video w-full rounded-[20px] bg-black"
      controls
      controlsList="nodownload"
      src={src}
      onEnded={() => {
        const form = new FormData();
        form.set("lessonId", lessonId);
        form.set("positionSeconds", String(Math.floor(videoRef.current?.duration ?? 0)));
        form.set("completed", "true");
        void saveProgressAction(form);
      }}
    >
      {captionsUrl ? (
        <track kind="captions" srcLang="en" label="English" src={captionsUrl} default />
      ) : null}
    </video>
  );
}
