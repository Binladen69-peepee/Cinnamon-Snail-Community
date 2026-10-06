"use client";

import { useId, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { AlertCircle, CheckCircle2, Loader2, Plus } from "lucide-react";
import {
  createCategoryAction,
  updateCategoryAction,
} from "@/app/admin/courses/categories/actions";
import { Button, Field, Input, Textarea } from "@/components/app/ui";

const NAME_MAX = 60;
const DESCRIPTION_MAX = 280;

/**
 * A category's name and description: creating one, or editing one in place.
 *
 * The slug is never shown or edited. It is set once from the first name and
 * kept through every rename, because `/learn?category=` links are shared and
 * a rename should not break them. The server re-validates everything; the
 * limits here are only there so the field stops you before the server does.
 */
export function CategoryForm({
  category,
  onDone,
  onCancel,
}: {
  /** Present when editing; absent when creating. */
  category?: { id: string; name: string; description: string | null };
  onDone?: () => void;
  onCancel?: () => void;
}) {
  const router = useRouter();
  const formRef = useRef<HTMLFormElement>(null);
  const nameId = useId();
  const descriptionId = useId();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  const editing = Boolean(category);

  function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    if (category) data.set("categoryId", category.id);
    setError(null);
    setSaved(false);
    startTransition(async () => {
      const result = editing
        ? await updateCategoryAction(data)
        : await createCategoryAction(data);
      if (!result.ok) {
        setError(result.error);
        return;
      }
      if (!editing) formRef.current?.reset();
      setSaved(true);
      router.refresh();
      onDone?.();
    });
  }

  return (
    <form
      ref={formRef}
      onSubmit={submit}
      className="flex flex-col gap-4"
      aria-busy={pending || undefined}
    >
      <Field label="Name" htmlFor={nameId} required>
        <Input
          id={nameId}
          name="name"
          defaultValue={category?.name ?? ""}
          required
          minLength={2}
          maxLength={NAME_MAX}
          placeholder="Fundamentals"
          autoComplete="off"
        />
      </Field>

      <Field
        label="Description"
        htmlFor={descriptionId}
        optional
        hint="One line under the shelf's heading in the library."
      >
        <Textarea
          id={descriptionId}
          name="description"
          rows={2}
          defaultValue={category?.description ?? ""}
          maxLength={DESCRIPTION_MAX}
          className="min-h-16 resize-y"
          placeholder="The techniques every other class builds on."
        />
      </Field>

      <div className="flex flex-wrap items-center justify-end gap-x-3 gap-y-2">
        {error ? (
          <p
            role="alert"
            className="mr-auto flex items-center gap-1.5 text-label font-medium text-danger"
          >
            <AlertCircle className="size-4 shrink-0" aria-hidden />
            {error}
          </p>
        ) : saved && !pending ? (
          <p
            role="status"
            className="mr-auto inline-flex items-center gap-1.5 text-label font-medium text-success"
          >
            <CheckCircle2 className="size-4" aria-hidden />
            {editing ? "Saved" : "Added to the end of the library"}
          </p>
        ) : null}
        {onCancel ? (
          <Button variant="ghost" onClick={onCancel} disabled={pending}>
            Cancel
          </Button>
        ) : null}
        <Button type="submit" variant="primary" disabled={pending}>
          {pending ? (
            <Loader2 className="size-4 animate-spin" aria-hidden />
          ) : editing ? null : (
            <Plus className="size-4" aria-hidden />
          )}
          {editing ? (pending ? "Saving" : "Save category") : pending ? "Adding" : "Add category"}
        </Button>
      </div>
    </form>
  );
}
