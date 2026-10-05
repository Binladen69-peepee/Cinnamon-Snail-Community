"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Check, Loader2, Undo2 } from "lucide-react";
import {
  markLessonCompleteAction,
  saveLessonResponseAction,
} from "@/app/(member)/learn/lesson-actions";
import { Button, Field, Textarea, cardClass } from "@/components/app/ui";

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
    <div className="flex flex-wrap items-center gap-3">
      <Button
        variant={done ? "secondary" : "primary"}
        onClick={toggle}
        disabled={pending}
      >
        {pending ? (
          <Loader2 className="size-4 animate-spin" aria-hidden />
        ) : done ? (
          <Undo2 className="size-4" aria-hidden />
        ) : (
          <Check className="size-4" aria-hidden />
        )}
        {done ? "Mark unfinished" : "Mark complete"}
      </Button>

      {done && !pending ? (
        <span className="inline-flex items-center gap-1.5 text-label font-medium text-success">
          <Check className="size-4" aria-hidden />
          Completed
        </span>
      ) : null}

      {error ? (
        <p role="alert" className="text-caption font-medium text-danger">
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
      className={cardClass({ className: "flex flex-col gap-4" })}
    >
      <Field label="Your answer" htmlFor="lesson-reflection" error={error}>
        <Textarea
          id="lesson-reflection"
          value={value}
          onChange={(event) => {
            setValue(event.target.value);
            setSaved(false);
          }}
          rows={6}
          maxLength={8000}
          placeholder="Write as much or as little as you like. Only you can see this."
          aria-invalid={error ? true : undefined}
          className="resize-y"
        />
      </Field>

      <div className="flex items-center gap-3">
        <Button
          type="submit"
          variant="primary"
          disabled={saving || !value.trim()}
        >
          {saving ? (
            <>
              <Loader2 className="size-4 animate-spin" aria-hidden />
              Saving
            </>
          ) : (
            "Save answer"
          )}
        </Button>
        {saved && !saving ? (
          <span className="inline-flex items-center gap-1.5 text-label font-medium text-foreground-muted">
            <Check className="size-4" aria-hidden />
            Saved
          </span>
        ) : null}
      </div>
    </form>
  );
}
