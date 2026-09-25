"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Check, Eye, EyeOff, Loader2, Plus, Trash2, X } from "lucide-react";
import type { InterestKind, SkillLevel } from "@prisma/client";
import { saveProfileAction } from "@/app/(member)/settings/profile-actions";
import { requestUploadAction } from "@/app/(member)/upload-actions";
import { Avatar } from "@/components/ui/avatar";
import { prepareForUpload, putWithProgress } from "@/lib/uploads/client";
import { IMAGE_ACCEPT, validateUpload } from "@/lib/uploads/policy";
import {
  INTEREST_KIND_LABELS,
  MAX_INTERESTS_PER_MEMBER,
} from "@/lib/community/interests";
import { cn } from "@/lib/utils";

/**
 * The edit-profile screen.
 *
 * Interests are a picker rather than a text box, which is the whole point of
 * the tag table behind it: fourteen members typing freely produced thirty-three
 * different words for about twelve ideas, and none of them could be filtered
 * on. Picking from a list is also faster than typing, which is the rare case
 * where the constraint is the nicer experience.
 *
 * Validation comes back from the server per field. Nothing is validated here
 * that is not validated there — the client copy exists to answer sooner, not
 * to decide.
 */

type Option = { slug: string; label: string; kind: InterestKind };

const SKILLS: { value: SkillLevel | ""; label: string; hint: string }[] = [
  { value: "", label: "Not saying", hint: "" },
  { value: "BEGINNER", label: "Beginner", hint: "Still finding my feet" },
  { value: "CONFIDENT", label: "Confident", hint: "I cook most nights" },
  { value: "ADVANCED", label: "Advanced", hint: "Happy improvising" },
];

export function ProfileEditor({
  profile,
  options,
  uploadsEnabled,
}: {
  profile: {
    handle: string;
    displayName: string;
    avatarUrl: string | null;
    bio: string | null;
    cookingLately: string | null;
    city: string | null;
    region: string | null;
    country: string | null;
    skill: SkillLevel | null;
    links: string[];
    interests: string[];
    dmPreference: "EVERYONE" | "CONNECTIONS" | "NOBODY";
    directoryVisible: boolean;
    showLocation: boolean;
    showLinks: boolean;
    showInterests: boolean;
  };
  options: Option[];
  uploadsEnabled: boolean;
}) {
  const router = useRouter();
  const [avatar, setAvatar] = useState(profile.avatarUrl);
  const [preview, setPreview] = useState<string | null>(profile.avatarUrl);
  const [picked, setPicked] = useState<string[]>(profile.interests);
  const [links, setLinks] = useState<string[]>(
    profile.links.length ? profile.links : [""],
  );
  const [uploading, setUploading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [formError, setFormError] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  const byKind = new Map<InterestKind, Option[]>();
  for (const option of options) {
    const bucket = byKind.get(option.kind);
    if (bucket) bucket.push(option);
    else byKind.set(option.kind, [option]);
  }

  function toggleInterest(slug: string) {
    setPicked((current) => {
      if (current.includes(slug)) return current.filter((item) => item !== slug);
      if (current.length >= MAX_INTERESTS_PER_MEMBER) return current;
      return [...current, slug];
    });
  }

  async function upload(file: File) {
    setErrors((current) => ({ ...current, avatarUrl: "" }));
    const check = validateUpload({ mimeType: file.type, size: file.size });
    if (!check.ok) {
      setErrors((current) => ({ ...current, avatarUrl: check.error }));
      return;
    }
    if (!file.type.startsWith("image/")) {
      setErrors((current) => ({
        ...current,
        avatarUrl: "A profile photo has to be an image.",
      }));
      return;
    }

    setUploading(true);
    const objectUrl = URL.createObjectURL(file);
    try {
      const prepared = await prepareForUpload(file);
      const ticket = await requestUploadAction({
        mimeType: prepared.mimeType,
        size: prepared.blob.size,
      });
      if (!ticket.ok) {
        setErrors((current) => ({ ...current, avatarUrl: ticket.error }));
        URL.revokeObjectURL(objectUrl);
        return;
      }
      await putWithProgress({
        url: ticket.ticket.signedUrl,
        blob: prepared.blob,
        mimeType: prepared.mimeType,
        onProgress: () => undefined,
      });
      setAvatar(ticket.ticket.readUrl);
      setPreview(objectUrl);
    } catch (failure) {
      URL.revokeObjectURL(objectUrl);
      setErrors((current) => ({
        ...current,
        avatarUrl: failure instanceof Error ? failure.message : "Upload failed.",
      }));
    } finally {
      setUploading(false);
    }
  }

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    data.set("avatarUrl", avatar ?? "");
    data.delete("interests");
    for (const slug of picked) data.append("interests", slug);
    data.delete("links");
    for (const link of links) if (link.trim()) data.append("links", link.trim());

    setSaving(true);
    setErrors({});
    setFormError(null);
    setSaved(false);
    const result = await saveProfileAction(data);
    setSaving(false);
    if (result.ok) {
      setSaved(true);
      router.refresh();
    } else {
      setErrors(result.fieldErrors ?? {});
      setFormError(result.formError ?? null);
    }
  }

  return (
    <form onSubmit={submit} className="space-y-6">
      {/* --- who you are ---------------------------------------------------- */}
      <section className="space-y-4 rounded-card border border-border bg-surface p-4">
        <h2 className="text-[14px] font-bold text-foreground">Who you are</h2>

        <div className="flex flex-wrap items-center gap-4">
          <Avatar
            name={profile.displayName}
            src={preview}
            size="lg"
            className="size-16"
          />
          <div className="min-w-0 space-y-1.5">
            {uploadsEnabled ? (
              <>
                <input
                  ref={fileRef}
                  type="file"
                  accept={IMAGE_ACCEPT}
                  className="sr-only"
                  onChange={(event) => {
                    const file = event.target.files?.[0];
                    if (file) void upload(file);
                    event.target.value = "";
                  }}
                />
                <div className="flex flex-wrap gap-2">
                  <button
                    type="button"
                    onClick={() => fileRef.current?.click()}
                    disabled={uploading}
                    className="inline-flex h-9 items-center gap-1.5 rounded-ctl border border-border bg-background px-3.5 text-[13px] font-semibold text-foreground transition hover:border-hairline-firm disabled:opacity-60"
                  >
                    {uploading ? (
                      <>
                        <Loader2 className="size-3.5 animate-spin" aria-hidden />
                        Uploading
                      </>
                    ) : (
                      "Change photo"
                    )}
                  </button>
                  {avatar ? (
                    <button
                      type="button"
                      onClick={() => {
                        setAvatar(null);
                        setPreview(null);
                      }}
                      className="inline-flex h-9 items-center gap-1.5 rounded-ctl border border-border bg-background px-3 text-[13px] font-semibold text-foreground-muted transition hover:border-hairline-firm hover:text-foreground"
                    >
                      <Trash2 className="size-3.5" aria-hidden />
                      Remove
                    </button>
                  ) : null}
                </div>
              </>
            ) : (
              <p className="text-[12.5px] text-foreground-muted">
                Uploads are not configured on this deployment.
              </p>
            )}
            <FieldError message={errors.avatarUrl} />
          </div>
        </div>

        <Field label="Display name" htmlFor="displayName" error={errors.displayName}>
          <input
            id="displayName"
            name="displayName"
            defaultValue={profile.displayName}
            required
            maxLength={80}
            className={input(errors.displayName)}
          />
        </Field>

        <Field
          label="What I'm cooking lately"
          htmlFor="cookingLately"
          help="One line, changed as often as you like. It leads your card in the directory."
          error={errors.cookingLately}
        >
          <input
            id="cookingLately"
            name="cookingLately"
            defaultValue={profile.cookingLately ?? ""}
            maxLength={140}
            placeholder="Working my way through a bag of dried beans"
            className={input(errors.cookingLately)}
          />
        </Field>

        <Field label="Bio" htmlFor="bio" error={errors.bio}>
          <textarea
            id="bio"
            name="bio"
            rows={4}
            defaultValue={profile.bio ?? ""}
            maxLength={1000}
            className={cn(input(errors.bio), "h-auto resize-y py-2 leading-relaxed")}
          />
        </Field>

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
          <Field label="City" htmlFor="city" error={errors.city}>
            <input
              id="city"
              name="city"
              defaultValue={profile.city ?? ""}
              maxLength={80}
              className={input(errors.city)}
            />
          </Field>
          <Field label="Region" htmlFor="region" error={errors.region}>
            <input
              id="region"
              name="region"
              defaultValue={profile.region ?? ""}
              maxLength={80}
              className={input(errors.region)}
            />
          </Field>
          <Field label="Country" htmlFor="country" error={errors.country}>
            <input
              id="country"
              name="country"
              defaultValue={profile.country ?? ""}
              maxLength={80}
              className={input(errors.country)}
            />
          </Field>
        </div>
        <p className="text-[12px] text-foreground-muted">
          City level only. No street address is ever stored on a profile.
        </p>
      </section>

      {/* --- how you cook --------------------------------------------------- */}
      <section className="space-y-4 rounded-card border border-border bg-surface p-4">
        <div>
          <h2 className="text-[14px] font-bold text-foreground">How you cook</h2>
          <p className="mt-0.5 text-[12.5px] text-foreground-muted">
            Pick up to {MAX_INTERESTS_PER_MEMBER}. These are what the directory
            filters on, and what member matching will use later — which is why
            they are a list rather than a text box.
          </p>
        </div>

        <fieldset>
          <legend className="mb-1.5 text-[12.5px] font-semibold text-foreground">
            Skill level
          </legend>
          <div className="flex flex-wrap gap-1.5">
            {SKILLS.map((option) => (
              <label
                key={option.value || "none"}
                className="cursor-pointer"
                title={option.hint}
              >
                <input
                  type="radio"
                  name="skill"
                  value={option.value}
                  defaultChecked={(profile.skill ?? "") === option.value}
                  className="peer sr-only"
                />
                <span className="inline-flex h-9 items-center rounded-full border border-border bg-background px-3.5 text-[13px] font-semibold text-foreground-muted transition peer-checked:border-brand peer-checked:bg-brand-wash peer-checked:text-brand-strong peer-focus-visible:ring-2 peer-focus-visible:ring-brand/40 hover:border-hairline-firm">
                  {option.label}
                </span>
              </label>
            ))}
          </div>
        </fieldset>

        <div className="space-y-3">
          {[...byKind.entries()].map(([kind, group]) => (
            <fieldset key={kind}>
              <legend className="mb-1.5 text-[12px] font-bold uppercase tracking-[0.1em] text-foreground-muted">
                {INTEREST_KIND_LABELS[kind]}
              </legend>
              <div className="flex flex-wrap gap-1.5">
                {group.map((option) => {
                  const on = picked.includes(option.slug);
                  const full = !on && picked.length >= MAX_INTERESTS_PER_MEMBER;
                  return (
                    <button
                      key={option.slug}
                      type="button"
                      onClick={() => toggleInterest(option.slug)}
                      disabled={full}
                      aria-pressed={on}
                      className={cn(
                        "inline-flex h-8 items-center gap-1 rounded-full border px-3 text-[12.5px] font-semibold transition",
                        on
                          ? "border-brand bg-brand-wash text-brand-strong"
                          : "border-border bg-background text-foreground-muted hover:border-hairline-firm hover:text-foreground",
                        full && "cursor-not-allowed opacity-40",
                      )}
                    >
                      {on ? (
                        <Check className="size-3" aria-hidden />
                      ) : (
                        <Plus className="size-3" aria-hidden />
                      )}
                      {option.label}
                    </button>
                  );
                })}
              </div>
            </fieldset>
          ))}
        </div>

        <p className="text-[12px] tabular-nums text-foreground-muted">
          {picked.length} of {MAX_INTERESTS_PER_MEMBER} picked
        </p>
      </section>

      {/* --- links ---------------------------------------------------------- */}
      <section className="space-y-3 rounded-card border border-border bg-surface p-4">
        <h2 className="text-[14px] font-bold text-foreground">Links</h2>
        {links.map((link, index) => (
          <div key={index} className="flex gap-2">
            <input
              value={link}
              onChange={(event) =>
                setLinks((current) =>
                  current.map((item, at) => (at === index ? event.target.value : item)),
                )
              }
              placeholder="yoursite.com"
              aria-label={`Link ${index + 1}`}
              className={cn(input(undefined), "min-w-0 flex-1")}
            />
            <button
              type="button"
              onClick={() =>
                setLinks((current) =>
                  current.length === 1
                    ? [""]
                    : current.filter((_, at) => at !== index),
                )
              }
              aria-label={`Remove link ${index + 1}`}
              className="grid size-9 shrink-0 place-items-center rounded-ctl border border-border bg-background text-foreground-muted transition hover:border-hairline-firm hover:text-danger"
            >
              <X className="size-4" aria-hidden />
            </button>
          </div>
        ))}
        <FieldError message={errors.links} />
        {links.length < 5 ? (
          <button
            type="button"
            onClick={() => setLinks((current) => [...current, ""])}
            className="inline-flex h-8 items-center gap-1.5 rounded-ctl border border-border bg-background px-3 text-[12.5px] font-semibold text-foreground transition hover:border-hairline-firm"
          >
            <Plus className="size-3.5" aria-hidden />
            Add a link
          </button>
        ) : null}
      </section>

      {/* --- privacy -------------------------------------------------------- */}
      <section className="space-y-3 rounded-card border border-border bg-surface p-4">
        <div>
          <h2 className="text-[14px] font-bold text-foreground">Who can see what</h2>
          <p className="mt-0.5 text-[12.5px] text-foreground-muted">
            Every one of these is enforced on the server. Hiding something
            removes it from the directory, from search and from anything that
            reads your profile — not just from the page.
          </p>
        </div>

        <Switch
          name="directoryVisible"
          label="Show me in the member directory"
          help="Off also removes you from search and from suggestions."
          defaultChecked={profile.directoryVisible}
          icon
        />
        <Switch
          name="showLocation"
          label="Show my city"
          help="Your country and region follow the same switch."
          defaultChecked={profile.showLocation}
        />
        <Switch
          name="showInterests"
          label="Show how I cook"
          help="Your skill level and the tags above."
          defaultChecked={profile.showInterests}
        />
        <Switch
          name="showLinks"
          label="Show my links"
          defaultChecked={profile.showLinks}
        />

        <Field label="Who can message me" htmlFor="dmPreference">
          <select
            id="dmPreference"
            name="dmPreference"
            defaultValue={profile.dmPreference}
            className={input(undefined)}
          >
            <option value="EVERYONE">Any member</option>
            <option value="CONNECTIONS">Only people I follow</option>
            <option value="NOBODY">Nobody</option>
          </select>
        </Field>
      </section>

      {formError ? (
        <p role="alert" className="text-[13px] font-semibold text-danger">
          {formError}
        </p>
      ) : null}

      <div className="flex flex-wrap items-center gap-3">
        <button
          type="submit"
          disabled={saving}
          className={cn(
            "inline-flex h-10 items-center gap-1.5 rounded-ctl px-5 text-[14px] font-semibold transition",
            saving
              ? "bg-default text-foreground-muted"
              : "bg-brand-fill text-brand-fill-foreground hover:bg-brand-fill-hover",
          )}
        >
          {saving ? (
            <>
              <Loader2 className="size-4 animate-spin" aria-hidden />
              Saving
            </>
          ) : (
            "Save profile"
          )}
        </button>
        {saved && !saving ? (
          <span
            role="status"
            className="inline-flex items-center gap-1 text-[13px] font-semibold text-foreground-muted"
          >
            <Check className="size-4" aria-hidden />
            Saved
          </span>
        ) : null}
        <a
          href={`/members/${profile.handle}`}
          className="text-[13px] font-semibold text-brand no-underline hover:underline"
        >
          View your profile
        </a>
      </div>
    </form>
  );
}

function input(error: string | undefined) {
  return cn(
    "h-9 w-full rounded-ctl border bg-field-background px-3 text-[13.5px] text-foreground outline-none transition placeholder:text-field-placeholder focus:ring-2 focus:ring-brand/25",
    error
      ? "border-danger focus:border-danger focus:ring-danger/25"
      : "border-field-border focus:border-brand",
  );
}

function Field({
  label,
  htmlFor,
  help,
  error,
  children,
}: {
  label: string;
  htmlFor: string;
  help?: string;
  error?: string;
  children: React.ReactNode;
}) {
  return (
    <div className="min-w-0">
      <label
        htmlFor={htmlFor}
        className="mb-1.5 block text-[12.5px] font-semibold text-foreground"
      >
        {label}
      </label>
      {children}
      {error ? (
        <FieldError message={error} />
      ) : help ? (
        <p className="mt-1.5 text-[12px] leading-snug text-foreground-muted">
          {help}
        </p>
      ) : null}
    </div>
  );
}

function FieldError({ message }: { message?: string }) {
  if (!message) return null;
  return (
    <p role="alert" className="mt-1.5 text-[12px] font-semibold text-danger">
      {message}
    </p>
  );
}

function Switch({
  name,
  label,
  help,
  defaultChecked,
  icon = false,
}: {
  name: string;
  label: string;
  help?: string;
  defaultChecked: boolean;
  icon?: boolean;
}) {
  const [on, setOn] = useState(defaultChecked);
  return (
    <label
      htmlFor={name}
      className="flex cursor-pointer items-start justify-between gap-4"
    >
      <span className="min-w-0">
        <span className="flex items-center gap-1.5 text-[13.5px] text-foreground">
          {icon ? (
            on ? (
              <Eye className="size-3.5 text-foreground-muted" aria-hidden />
            ) : (
              <EyeOff className="size-3.5 text-foreground-muted" aria-hidden />
            )
          ) : null}
          {label}
        </span>
        {help ? (
          <span className="mt-0.5 block text-[12px] leading-snug text-foreground-muted">
            {help}
          </span>
        ) : null}
      </span>

      <span className="relative mt-0.5 shrink-0">
        <input
          id={name}
          name={name}
          type="checkbox"
          role="switch"
          checked={on}
          onChange={(event) => setOn(event.target.checked)}
          className="peer h-5 w-9 cursor-pointer appearance-none rounded-full border border-field-border bg-default transition checked:border-brand checked:bg-brand focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand/40"
        />
        <span
          className="pointer-events-none absolute left-0.5 top-1/2 size-4 -translate-y-1/2 rounded-full bg-foreground transition-transform peer-checked:translate-x-4 peer-checked:bg-on-brand"
          aria-hidden
        />
      </span>
    </label>
  );
}
