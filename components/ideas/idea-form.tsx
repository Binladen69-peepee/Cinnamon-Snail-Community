"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useId, useState, useTransition, type FormEvent } from "react";
import { Loader2 } from "lucide-react";
import { editIdeaAction, submitIdeaAction } from "@/app/(member)/ideas/actions";
import { Button, ButtonLink, Callout, Field, Input } from "@/components/app/ui";
import { RichEditor } from "@/components/feed/rich-editor";
import { CATEGORY_ICON } from "@/components/ideas/idea-badges";
import { SimilarIdeas } from "@/components/ideas/similar-ideas";
import { toast } from "@/components/ui/toast";
import {
  IDEA_BODY_MAX,
  IDEA_CATEGORIES,
  IDEA_CATEGORY_VALUES,
  IDEA_TITLE_MAX,
  IDEA_TITLE_MIN,
  type IdeaCategoryValue,
} from "@/lib/ideas/constants";
import { normalizeIdeaTitle } from "@/lib/ideas/similarity";
import { cn } from "@/lib/utils";

type Errors = { title?: string; body?: string; category?: string; form?: string };

/**
 * Sharing an idea, or fixing one.
 *
 * Three things, in the order that matters: the title (with the ideas that
 * already look like it, so the member can vote instead), what kind of idea it
 * is, and the details. The details are markdown through the same editor and
 * the same safe renderer as every post, so bold is bold and raw HTML is not.
 *
 * The server checks everything again; this only says so sooner.
 */
export function IdeaForm({
  mode,
  ideaId,
  initial,
  cancelHref,
}: {
  mode: "create" | "edit";
  ideaId?: string;
  initial?: { title: string; body: string; category: IdeaCategoryValue | null };
  cancelHref: string;
}) {
  const router = useRouter();
  const ids = useId();
  const [title, setTitle] = useState(initial?.title ?? "");
  const [body, setBody] = useState(initial?.body ?? "");
  const [category, setCategory] = useState<IdeaCategoryValue | null>(initial?.category ?? null);
  const [errors, setErrors] = useState<Errors>({});
  const [existing, setExisting] = useState<{ id: string; title: string } | null>(null);
  const [pending, startTransition] = useTransition();

  const titleLength = normalizeIdeaTitle(title).length;

  function check(): Errors {
    const found: Errors = {};
    if (titleLength < IDEA_TITLE_MIN) {
      found.title = `Give it a title of at least ${IDEA_TITLE_MIN} characters.`;
    } else if (titleLength > IDEA_TITLE_MAX) {
      found.title = `Keep the title under ${IDEA_TITLE_MAX} characters.`;
    }
    if (!category) found.category = "Pick what kind of idea this is.";
    if (body.trim().length > IDEA_BODY_MAX) {
      found.body = `Keep the details under ${IDEA_BODY_MAX} characters.`;
    }
    return found;
  }

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (pending) return;
    const found = check();
    setErrors(found);
    setExisting(null);
    if (Object.keys(found).length > 0) {
      const firstField = found.title ? "title" : found.category ? "category" : "body";
      document.getElementById(`${ids}-${firstField}`)?.focus();
      return;
    }

    const data = new FormData();
    data.set("title", title);
    data.set("body", body);
    data.set("category", category ?? "");
    if (ideaId) data.set("ideaId", ideaId);

    startTransition(async () => {
      let result: Awaited<ReturnType<typeof submitIdeaAction>>;
      try {
        result = mode === "create" ? await submitIdeaAction(data) : await editIdeaAction(data);
      } catch {
        setErrors({ form: "That did not go through. Check your connection and try again." });
        return;
      }
      if (result.ok) {
        toast.success(mode === "create" ? "Your idea is on the board." : "Your changes are saved.");
        router.push(`/ideas/${result.id}`);
        return;
      }
      if (result.existing) {
        // Not an error so much as a pointer: the request already has a home.
        setExisting(result.existing);
        setErrors({});
        return;
      }
      if (result.field) {
        const field = result.field;
        setErrors({ [field]: result.error } as Errors);
        document.getElementById(`${ids}-${field}`)?.focus();
        return;
      }
      setErrors({ form: result.error });
    });
  }

  return (
    <form onSubmit={submit} noValidate className="flex flex-col gap-6">
      {errors.form ? <Callout tone="danger">{errors.form}</Callout> : null}

      <div className="flex flex-col gap-3">
        <Field
          label="Title"
          htmlFor={`${ids}-title`}
          required
          error={errors.title}
          hint={
            <span className="tabular-nums">
              A few words that say what you are asking for. {titleLength}/{IDEA_TITLE_MAX}
            </span>
          }
        >
          <Input
            id={`${ids}-title`}
            name="title"
            size="lg"
            value={title}
            maxLength={IDEA_TITLE_MAX}
            autoComplete="off"
            placeholder="A class on laminated doughs, a weeknight ramen, offline recipes…"
            aria-invalid={errors.title ? true : undefined}
            disabled={pending}
            onChange={(event) => {
              setTitle(event.currentTarget.value);
              if (errors.title) setErrors((current) => ({ ...current, title: undefined }));
              if (existing) setExisting(null);
            }}
          />
        </Field>

        {existing ? (
          <Callout tone="info" title="That idea is already on the board">
            <Link
              href={`/ideas/${existing.id}`}
              className="font-medium text-link no-underline hover:underline"
            >
              {existing.title}
            </Link>
            . Add your vote there, so the request counts once and counts more.
          </Callout>
        ) : null}

        {mode === "create" ? <SimilarIdeas title={title} excludeId={ideaId} /> : null}
      </div>

      <fieldset className="flex flex-col gap-1.5" aria-describedby={errors.category ? `${ids}-category-error` : undefined}>
        <legend className="mb-1.5 text-label font-medium text-foreground">
          What kind of idea is it?
          <span className="ml-0.5 text-danger" aria-hidden>
            *
          </span>
        </legend>
        <div className="grid grid-cols-1 gap-2 min-[400px]:grid-cols-2">
          {IDEA_CATEGORY_VALUES.map((value, index) => {
            const selected = category === value;
            const Icon = CATEGORY_ICON[value];
            return (
              <label
                key={value}
                className={cn(
                  "flex cursor-pointer items-start gap-2.5 rounded-ctl border px-3 py-2.5 transition",
                  selected
                    ? "border-brand bg-brand-wash"
                    : "border-border bg-surface hover:border-hairline-firm hover:bg-surface-muted",
                )}
              >
                <input
                  id={index === 0 ? `${ids}-category` : undefined}
                  type="radio"
                  name="category"
                  value={value}
                  checked={selected}
                  disabled={pending}
                  onChange={() => {
                    setCategory(value);
                    if (errors.category) setErrors((current) => ({ ...current, category: undefined }));
                  }}
                  className="mt-0.5 size-4 shrink-0"
                />
                <span className="min-w-0">
                  <span className="flex items-center gap-1.5 text-label font-medium text-foreground">
                    <Icon className="size-3.5 text-foreground-muted" aria-hidden />
                    {IDEA_CATEGORIES[value].label}
                  </span>
                  <span className="mt-0.5 block text-caption text-foreground-muted">
                    {IDEA_CATEGORIES[value].hint}
                  </span>
                </span>
              </label>
            );
          })}
        </div>
        {errors.category ? (
          <p id={`${ids}-category-error`} role="alert" className="text-caption font-medium text-danger">
            {errors.category}
          </p>
        ) : null}
      </fieldset>

      <Field
        label="Details"
        htmlFor={`${ids}-body`}
        optional
        error={errors.body}
        hint="What would you want from it? Bold, lists and links work."
      >
        <RichEditor
          id={`${ids}-body`}
          name="body"
          value={body}
          onChange={(next) => {
            setBody(next);
            if (errors.body) setErrors((current) => ({ ...current, body: undefined }));
          }}
          rows={6}
          maxLength={IDEA_BODY_MAX}
          disabled={pending}
          placeholder="The dish, the technique, the problem it would solve…"
        />
      </Field>

      <div className="flex flex-col-reverse gap-2 border-t border-separator pt-5 sm:flex-row sm:items-center sm:justify-end">
        <ButtonLink href={cancelHref} className="w-full sm:w-auto">
          Cancel
        </ButtonLink>
        <Button
          type="submit"
          variant="primary"
          disabled={pending}
          className="w-full sm:w-auto"
        >
          {pending ? <Loader2 className="size-4 animate-spin" aria-hidden /> : null}
          {mode === "create" ? "Share idea" : "Save changes"}
        </Button>
      </div>
    </form>
  );
}
