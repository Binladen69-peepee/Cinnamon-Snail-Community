"use client";

import { useEffect, useId, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import {
  Boxes,
  FileDown,
  GraduationCap,
  Lock,
  Video,
  X,
} from "lucide-react";
import { createCourseAction } from "@/app/admin/courses/actions";
import { cn } from "@/lib/utils";

/**
 * "New Product", to the supplied design.
 *
 * All four product types are listed because the design lists them. Only Online
 * Courses can be created: this platform has no Digital Downloads or Webinar
 * entity at all, and a Bundle is a SamCart billing product rather than
 * something authored here. The other three are shown disabled with the reason,
 * which is the same choice the message composer makes about members it cannot
 * reach — the label tells you why, where an absence would tell you nothing.
 */

const TYPES = [
  {
    value: "course",
    title: "Online Courses",
    body: "Create a series of lessons with files, posts, and quizzes.",
    icon: GraduationCap,
    tone: "bg-brand-wash text-brand-strong",
    disabled: null as string | null,
  },
  {
    value: "downloads",
    title: "Digital Downloads",
    body: "Offer a file or collection of files for download.",
    icon: FileDown,
    tone: "bg-default text-foreground-muted",
    disabled: "Not a product type on this platform yet.",
  },
  {
    value: "webinar",
    title: "Webinar",
    body: "Sell access to a Zoom or YouTube webinar.",
    icon: Video,
    tone: "bg-default text-foreground-muted",
    disabled: "Live sessions are events, created on the calendar.",
  },
  {
    value: "bundle",
    title: "Bundle",
    body: "Sell a collection of other products for a new price.",
    icon: Boxes,
    tone: "bg-default text-foreground-muted",
    disabled: "Bundles are billing products, managed in SamCart.",
  },
];

export function NewCourseDialog({ open }: { open: boolean }) {
  const router = useRouter();
  const titleId = useId();
  const nameId = useId();
  const inputRef = useRef<HTMLInputElement>(null);
  const [name, setName] = useState("");
  const [type, setType] = useState("course");
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  function close() {
    router.push("/admin/courses");
  }

  useEffect(() => {
    if (!open) return;
    const previous = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    inputRef.current?.focus();
    function onKey(event: KeyboardEvent) {
      if (event.key === "Escape") close();
    }
    document.addEventListener("keydown", onKey);
    return () => {
      document.body.style.overflow = previous;
      document.removeEventListener("keydown", onKey);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  if (!open) return null;

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!name.trim()) {
      setError("Give the product a name.");
      return;
    }
    setSaving(true);
    setError(null);
    const data = new FormData();
    data.set("name", name);
    const result = await createCourseAction(data);
    if (!result.ok) {
      setError(result.error);
      setSaving(false);
    }
    // On success the action redirects to the new course's edit screen.
  }

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby={titleId}
      onClick={close}
      className="fixed inset-0 z-[80] flex items-center justify-center bg-black/55 p-4"
    >
      <form
        onClick={(event) => event.stopPropagation()}
        onSubmit={submit}
        className="w-full max-w-[560px] overflow-hidden rounded-modal bg-overlay shadow-e3"
      >
        <div className="flex items-center justify-between gap-3 px-5 pb-1 pt-5">
          <h2
            id={titleId}
            className="font-display text-[1.15rem] font-bold text-foreground"
          >
            New Product
          </h2>
          <button
            type="button"
            onClick={close}
            aria-label="Close"
            className="grid size-8 place-items-center rounded-full text-foreground-muted transition hover:bg-mint hover:text-foreground"
          >
            <X className="size-5" aria-hidden />
          </button>
        </div>

        <div className="space-y-4 px-5 py-4">
          <div>
            <label
              htmlFor={nameId}
              className="mb-1.5 block text-[13px] font-bold text-foreground"
            >
              Product name
            </label>
            <input
              ref={inputRef}
              id={nameId}
              value={name}
              onChange={(event) => setName(event.target.value)}
              placeholder="How to launch product fast in 2025"
              maxLength={160}
              className="h-11 w-full rounded-ctl border border-border bg-field-background px-3 text-[14px] text-foreground outline-none transition placeholder:text-foreground-muted focus:border-brand focus:ring-2 focus:ring-brand/20"
            />
          </div>

          <fieldset>
            <legend className="mb-1.5 text-[13px] font-bold text-foreground">
              Product Type
            </legend>
            <div className="space-y-1">
              {TYPES.map((option) => {
                const Icon = option.icon;
                const checked = type === option.value;
                return (
                  <label
                    key={option.value}
                    className={cn(
                      "flex items-start gap-3 rounded-ctl px-2 py-2.5 transition",
                      option.disabled
                        ? "cursor-not-allowed opacity-60"
                        : "cursor-pointer hover:bg-mint",
                    )}
                  >
                    <span
                      className={cn(
                        "grid size-9 shrink-0 place-items-center rounded-ctl",
                        option.tone,
                      )}
                      aria-hidden
                    >
                      <Icon className="size-4.5" />
                    </span>

                    <span className="min-w-0 flex-1">
                      <span className="block text-[13.5px] font-bold text-foreground">
                        {option.title}
                      </span>
                      <span className="block text-[12.5px] leading-snug text-foreground-muted">
                        {option.disabled ? (
                          <span className="inline-flex items-center gap-1">
                            <Lock className="size-3 shrink-0" aria-hidden />
                            {option.disabled}
                          </span>
                        ) : (
                          option.body
                        )}
                      </span>
                    </span>

                    <input
                      type="radio"
                      name="type"
                      value={option.value}
                      checked={checked}
                      disabled={Boolean(option.disabled)}
                      onChange={() => setType(option.value)}
                      className="mt-1 size-4 shrink-0 accent-[var(--brand)]"
                    />
                  </label>
                );
              })}
            </div>
          </fieldset>

          {error ? (
            <p role="alert" className="text-[12.5px] font-semibold text-danger">
              {error}
            </p>
          ) : null}
        </div>

        <div className="flex items-center justify-end gap-2 border-t border-border px-5 py-3.5">
          <button
            type="button"
            onClick={close}
            className="h-9 rounded-ctl border border-border bg-background px-4 text-[13.5px] font-semibold text-foreground transition hover:border-hairline-firm"
          >
            Discard
          </button>
          <button
            type="submit"
            disabled={saving || !name.trim()}
            className={cn(
              "h-9 rounded-ctl px-4 text-[13.5px] font-semibold transition",
              saving || !name.trim()
                ? "bg-default text-foreground-muted"
                : "bg-brand-fill text-brand-fill-foreground hover:bg-brand-fill-hover",
            )}
          >
            {saving ? "Creating…" : "Create Product"}
          </button>
        </div>
      </form>
    </div>
  );
}
