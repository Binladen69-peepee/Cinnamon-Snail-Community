"use client";

import { useEffect } from "react";

export function SamCartScript({ src }: { src: string }) {
  useEffect(() => {
    if (document.querySelector(`script[src="${src}"]`)) return;

    const script = document.createElement("script");
    script.src = src;
    script.async = true;
    document.body.appendChild(script);

    return () => {
      script.remove();
    };
  }, [src]);

  return null;
}