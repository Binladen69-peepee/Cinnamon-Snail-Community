"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Check, Loader2, Undo2 } from "lucide-react";
import {
  markLessonCompleteAction,
  saveLessonResponseAction,
} from "@/app/(member)/learn/lesson-actions";
import { cn } from "@/lib/utils";

/**
 * "I've done this", for a lesson with nothing to play.
 *
 * A written lesson, a handout and a live session all end when the member says
 * they end. The video player has its own version of this button, driven by the
 * recording; this is the one for everything else.
 *
 * Marking it undone is offered too, because the alternative — a mis-tap that
 * permanently claims a lesson was finished — is exactly the fake completion
 * the whole progress layer is written to avoid.
 */
export function CompleteButton({
  lessonId,
  completed,
}: {
  lessonId: string;
  completed: boolean;
}) {
  const router = useRouter();
  const [done, setDone] = useState(completed);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function toggle() {
    const next = !done;
    setError(null);
    startTransition(async () => {
      const result = await markLessonCompleteAction(lessonId, next);
      if (result.ok) {
        setDone(next);
        router.refresh();
      } else {
        setError(result.error);
      }
    });
  }

  return (
    <div className="flex flex-wrap items-center gap-2">
      <button
        type="button"
        onClick={toggle}
        disabled={pending}
        className={cn(
          "inline-flex h-9 items-center gap-1.5 rounded-ctl px-4 text-[13.5px] font-semibold transition",
          done
            ? "border border-border bg-surface text-foreground hover:border-hairline-firm"
            : "bg-brand-fill text-brand-fill-foreground hover:bg-brand-fill-hover",
          pending && "opacity-70",
        )}
      >
        {pending ? (
          <Loader2 className="size-3.5 animate-spin" aria-hidden />
        ) : done ? (
          <Undo2 className="size-3.5" aria-hidden />
        ) : (
          <Check className="size-3.5" aria-hidden />
        )}
        {done ? "Mark unfinished" : "Mark complete"}
      </button>

      {done && !pending ? (
        <span className="inline-flex items-center gap-1 text-[12.5px] font-semibold text-brand-strong">
          <Check className="size-3.5" aria-hidden />
          Completed
        </span>
      ) : null}

      {error ? (
        <p role="alert" className="text-[12.5px] font-semibold text-danger">
          {error}
        </p>
      ) : null}
    </div>
  );
}

/**
 * A reflection prompt's answer.
 *
 * One row per member per lesson, replaced rather than appended to. It is
 * private: nobody else's answer is shown and this one is not posted anywhere,
 * because a reflection people know is public stops being a reflection.
 */
export function ReflectionForm({
  lessonId,
  answer,
}: {
  lessonId: string;
  answer: string | null;
}) {
  const router = useRouter();
  const [value, setValue] = useState(answer ?? "");
  const [saved, setSaved] = useState(Boolean(answer));
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSaving(true);
    setError(null);
    const result = await saveLessonResponseAction(lessonId, value);
    setSaving(false);
    if (result.ok) {
      setSaved(true);
      router.refresh();
    } else {
      setError(result.error);
    }
  }

  return (
    <form
      onSubmit={submit}
      className="space-y-2.5 rounded-card border border-border bg-surface p-3.5"
    >
      <label
        htmlFor="lesson-reflection"
        className="block text-[13px] font-bold text-foreground"
      >
        Your answer
      </label>
      <textarea
        id="lesson-reflection"
        value={value}
        onChange={(event) => {
          setValue(event.target.value);
          setSaved(false);
        }}
        rows={6}
        maxLength={8000}
        placeholder="Write as much or as little as you like. Only you can see this."
        className="w-full resize-y rounded-ctl border border-field-border bg-field-background px-3 py-2 text-[14px] leading-relaxed text-foreground outline-none transition placeholder:text-field-placeholder focus:border-brand focus:ring-2 focus:ring-brand/25"
      />

      {error ? (
        <p role="alert" className="text-[12.5px] font-semibold text-danger">
          {error}
        </p>
      ) : null}

      <div className="flex items-center gap-2">
        <button
          type="submit"
          disabled={saving || !value.trim()}
          className={cn(
            "inline-flex h-9 items-center gap-1.5 rounded-ctl px-4 text-[13.5px] font-semibold transition",
            saving || !value.trim()
              ? "bg-default text-foreground-muted"
              : "bg-brand-fill text-brand-fill-foreground hover:bg-brand-fill-hover",
          )}
        >
          {saving ? (
            <>
              <Loader2 className="size-3.5 animate-spin" aria-hidden />
              Saving
            </>
          ) : (
            "Save answer"
          )}
        </button>
        {saved && !saving ? (
          <span className="inline-flex items-center gap-1 text-[12.5px] font-semibold text-foreground-muted">
            <Check className="size-3.5" aria-hidden />
            Saved
          </span>
        ) : null}
      </div>
    </form>
  );
}
