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
import {
  Button,
  Callout,
  Field,
  Input,
  backdropClass,
  dialogClass,
} from "@/components/app/ui";
import { cn } from "@/lib/utils";

/**
 * "New product", to the supplied design.
 *
 * All four product types are listed because the design lists them. Only Online
 * courses can be created: this platform has no Digital downloads or Webinar
 * entity at all, and a Bundle is a SamCart billing product rather than
 * something authored here. The other three are shown disabled with the reason,
 * which is the same choice the message composer makes about members it cannot
 * reach — the label tells you why, where an absence would tell you nothing.
 */

const TYPES = [
  {
    value: "course",
    title: "Online courses",
    body: "Create a series of lessons with files, posts, and quizzes.",
    icon: GraduationCap,
    tone: "bg-brand-wash text-on-brand-wash",
    disabled: null as string | null,
  },
  {
    value: "downloads",
    title: "Digital downloads",
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
    disabled: "Live sessions are live classes, created under Live classes.",
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
      className={cn(
        backdropClass,
        "z-80 flex items-start justify-center overflow-y-auto p-3 sm:p-6",
      )}
    >
      <form
        onClick={(event) => event.stopPropagation()}
        onSubmit={submit}
        className={cn(dialogClass, "my-auto w-full max-w-140 overflow-hidden")}
      >
        <div className="flex items-center justify-between gap-3 border-b border-separator py-3 pl-5 pr-3">
          <h2 id={titleId} className="text-title font-semibold text-foreground">
            New product
          </h2>
          <Button variant="ghost" size="sm" iconOnly onClick={close} aria-label="Close">
            <X className="size-4.5" aria-hidden />
          </Button>
        </div>

        <div className="flex flex-col gap-5 px-5 py-5">
          <Field label="Product name" htmlFor={nameId}>
            <Input
              ref={inputRef}
              id={nameId}
              size="lg"
              value={name}
              onChange={(event) => setName(event.target.value)}
              placeholder="How to launch product fast in 2025"
              maxLength={160}
            />
          </Field>

          <fieldset className="min-w-0">
            <legend className="mb-2 text-label font-medium text-foreground">
              Product type
            </legend>
            <div className="-mx-2 flex flex-col gap-0.5">
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
                        : "cursor-pointer hover:bg-surface-muted",
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
                      <span className="block text-body font-medium text-foreground">
                        {option.title}
                      </span>
                      <span className="mt-0.5 block text-caption text-foreground-muted">
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
                      className="mt-1 size-4 shrink-0 accent-brand"
                    />
                  </label>
                );
              })}
            </div>
          </fieldset>

          {error ? <Callout tone="danger">{error}</Callout> : null}
        </div>

        <div className="flex items-center justify-end gap-2 border-t border-separator px-5 py-3.5">
          <Button onClick={close}>Discard</Button>
          <Button
            type="submit"
            variant="primary"
            disabled={saving || !name.trim()}
            aria-busy={saving || undefined}
          >
            {saving ? "Creating…" : "Create product"}
          </Button>
        </div>
      </form>
    </div>
  );
}
