"use client";

import { Share2 } from "lucide-react";
import { useState } from "react";

export function ShareButton({ path }: { path: string }) {
  const [copied, setCopied] = useState(false);

  async function share() {
    const url = new URL(path, window.location.origin).toString();
    if (navigator.share) {
      await navigator.share({ url, title: "Vegan University" }).catch(() => undefined);
      return;
    }
    await navigator.clipboard.writeText(url);
    setCopied(true);
    window.setTimeout(() => setCopied(false), 2000);
  }

  return (
    <button
      type="button"
      onClick={share}
      className="inline-flex h-8 items-center gap-1.5 bg-background px-3 text-xs font-semibold text-foreground hover:bg-border"
      style={{ borderRadius: 12 }}
    >
      <Share2 className="size-3.5" aria-hidden />
      {copied ? "Copied" : "Share"}
    </button>
  );
}
