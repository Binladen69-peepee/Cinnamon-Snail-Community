"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Check, Eye, EyeOff, Loader2, Plus, Trash2, X } from "lucide-react";
import type { InterestKind, SkillLevel } from "@prisma/client";
import { saveProfileAction } from "@/app/(member)/settings/profile-actions";
import { requestUploadAction } from "@/app/(member)/upload-actions";
import { Avatar } from "@/components/ui/avatar";
import {
  Button,
  Callout,
  Card,
  Field,
  FormSection,
  Input,
  Select,
  Textarea,
  chipClass,
} from "@/components/app/ui";
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
    <form onSubmit={submit} className="flex flex-col gap-10">
      {/* --- who you are ---------------------------------------------------- */}
      <FormSection title="Who you are">
        <Card className="flex flex-col gap-5">
          <div className="flex flex-wrap items-center gap-4">
            <Avatar
              name={profile.displayName}
              src={preview}
              size="lg"
              className="size-16"
            />
            <div className="flex min-w-0 flex-col gap-1.5">
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
                    <Button
                      onClick={() => fileRef.current?.click()}
                      disabled={uploading}
                    >
                      {uploading ? (
                        <>
                          <Loader2 className="size-4 animate-spin" aria-hidden />
                          Uploading
                        </>
                      ) : (
                        "Change photo"
                      )}
                    </Button>
                    {avatar ? (
                      <Button
                        variant="ghost"
                        onClick={() => {
                          setAvatar(null);
                          setPreview(null);
                        }}
                      >
                        <Trash2 className="size-4" aria-hidden />
                        Remove
                      </Button>
                    ) : null}
                  </div>
                </>
              ) : (
                <p className="text-label text-foreground-muted">
                  Uploads are not configured on this deployment.
                </p>
              )}
              <FieldError message={errors.avatarUrl} />
            </div>
          </div>

          <Field label="Display name" htmlFor="displayName" error={errors.displayName}>
            <Input
              id="displayName"
              name="displayName"
              defaultValue={profile.displayName}
              required
              maxLength={80}
              aria-invalid={errors.displayName ? true : undefined}
            />
          </Field>

          <Field
            label="What I'm cooking lately"
            htmlFor="cookingLately"
            hint="One line, changed as often as you like. It leads your card in the directory."
            error={errors.cookingLately}
          >
            <Input
              id="cookingLately"
              name="cookingLately"
              defaultValue={profile.cookingLately ?? ""}
              maxLength={140}
              placeholder="Working my way through a bag of dried beans"
              aria-invalid={errors.cookingLately ? true : undefined}
            />
          </Field>

          <Field label="Bio" htmlFor="bio" error={errors.bio}>
            <Textarea
              id="bio"
              name="bio"
              rows={4}
              defaultValue={profile.bio ?? ""}
              maxLength={1000}
              className="resize-y"
              aria-invalid={errors.bio ? true : undefined}
            />
          </Field>

          <div className="flex flex-col gap-2">
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
              <Field label="City" htmlFor="city" error={errors.city}>
                <Input
                  id="city"
                  name="city"
                  defaultValue={profile.city ?? ""}
                  maxLength={80}
                  aria-invalid={errors.city ? true : undefined}
                />
              </Field>
              <Field label="Region" htmlFor="region" error={errors.region}>
                <Input
                  id="region"
                  name="region"
                  defaultValue={profile.region ?? ""}
                  maxLength={80}
                  aria-invalid={errors.region ? true : undefined}
                />
              </Field>
              <Field label="Country" htmlFor="country" error={errors.country}>
                <Input
                  id="country"
                  name="country"
                  defaultValue={profile.country ?? ""}
                  maxLength={80}
                  aria-invalid={errors.country ? true : undefined}
                />
              </Field>
            </div>
            <p className="text-caption text-foreground-muted">
              City level only. No street address is ever stored on a profile.
            </p>
          </div>
        </Card>
      </FormSection>

      {/* --- how you cook --------------------------------------------------- */}
      <FormSection
        title="How you cook"
        description={
          <>
            Pick up to {MAX_INTERESTS_PER_MEMBER}. These are what the directory
            filters on, and what &ldquo;Show similarities&rdquo; and &ldquo;Similar to
            you&rdquo; compare — which is why they are a list rather than a text
            box.
          </>
        }
      >
        <Card className="flex flex-col gap-5">
          <fieldset className="flex flex-col gap-2">
            <legend className="mb-2 text-label font-medium text-foreground">
              Skill level
            </legend>
            <div className="flex flex-wrap gap-2">
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
                  <span
                    className={cn(
                      chipClass(false),
                      "peer-checked:border-transparent peer-checked:bg-brand-wash peer-checked:text-on-brand-wash peer-focus-visible:ring-2 peer-focus-visible:ring-brand peer-focus-visible:ring-offset-2 peer-focus-visible:ring-offset-surface",
                    )}
                  >
                    {option.label}
                  </span>
                </label>
              ))}
            </div>
          </fieldset>

          <div className="flex flex-col gap-4 border-t border-separator pt-4">
            {[...byKind.entries()].map(([kind, group]) => (
              <fieldset key={kind}>
                <legend className="mb-2 text-micro font-semibold uppercase tracking-[0.08em] text-foreground-muted">
                  {INTEREST_KIND_LABELS[kind]}
                </legend>
                <div className="flex flex-wrap gap-2">
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
                        className={chipClass(
                          on,
                          cn("[&_svg]:size-3", full && "cursor-not-allowed opacity-40"),
                        )}
                      >
                        {on ? (
                          <Check aria-hidden />
                        ) : (
                          <Plus aria-hidden />
                        )}
                        {option.label}
                      </button>
                    );
                  })}
                </div>
              </fieldset>
            ))}
          </div>

          <p className="text-caption tabular-nums text-foreground-muted">
            {picked.length} of {MAX_INTERESTS_PER_MEMBER} picked
          </p>
        </Card>
      </FormSection>

      {/* --- links ---------------------------------------------------------- */}
      <FormSection title="Links">
        <Card className="flex flex-col gap-3">
          {links.map((link, index) => (
            <div key={index} className="flex gap-2">
              <Input
                value={link}
                onChange={(event) =>
                  setLinks((current) =>
                    current.map((item, at) => (at === index ? event.target.value : item)),
                  )
                }
                placeholder="yoursite.com"
                aria-label={`Link ${index + 1}`}
                className="flex-1"
              />
              <Button
                variant="ghost"
                iconOnly
                onClick={() =>
                  setLinks((current) =>
                    current.length === 1
                      ? [""]
                      : current.filter((_, at) => at !== index),
                  )
                }
                aria-label={`Remove link ${index + 1}`}
              >
                <X className="size-4" aria-hidden />
              </Button>
            </div>
          ))}
          <FieldError message={errors.links} />
          {links.length < 5 ? (
            <Button
              size="sm"
              onClick={() => setLinks((current) => [...current, ""])}
              className="self-start"
            >
              <Plus className="size-4" aria-hidden />
              Add a link
            </Button>
          ) : null}
        </Card>
      </FormSection>

      {/* --- privacy -------------------------------------------------------- */}
      <FormSection
        title="Who can see what"
        description="Every one of these is enforced on the server. Hiding something removes it from the directory, from search and from anything that reads your profile — not just from the page."
      >
        <Card padding="none" className="overflow-hidden">
          <div className="divide-y divide-separator">
            <Switch
              name="directoryVisible"
              label="Show me in the member directory"
              help="Off also removes you from search, from the discovery lists and from Show similarities."
              defaultChecked={profile.directoryVisible}
              icon
            />
            <Switch
              name="showLocation"
              label="Show my city"
              help="Your country and region follow the same switch. Members near you only lists members who show it."
              defaultChecked={profile.showLocation}
            />
            <Switch
              name="showInterests"
              label="Show how I cook"
              help="Your skill level and the tags above, here and in what members see you have in common."
              defaultChecked={profile.showInterests}
            />
            <Switch
              name="showLinks"
              label="Show my links"
              defaultChecked={profile.showLinks}
            />
          </div>

          <div className="border-t border-separator px-4 py-4 sm:px-5">
            <Field label="Who can message me" htmlFor="dmPreference">
              <Select
                id="dmPreference"
                name="dmPreference"
                defaultValue={profile.dmPreference}
              >
                <option value="EVERYONE">Any member</option>
                <option value="CONNECTIONS">Only people I follow</option>
                <option value="NOBODY">Nobody</option>
              </Select>
            </Field>
          </div>
        </Card>
      </FormSection>

      <div className="grid grid-cols-1 gap-4 md:grid-cols-[minmax(0,14rem)_minmax(0,1fr)] md:gap-8">
        <div className="flex flex-col gap-4 md:col-start-2">
          {formError ? <Callout tone="danger">{formError}</Callout> : null}

          <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
            <Button type="submit" variant="primary" size="lg" disabled={saving}>
              {saving ? (
                <>
                  <Loader2 className="size-4 animate-spin" aria-hidden />
                  Saving
                </>
              ) : (
                "Save profile"
              )}
            </Button>
            {saved && !saving ? (
              <span
                role="status"
                className="inline-flex items-center gap-1 text-label font-medium text-success"
              >
                <Check className="size-4" aria-hidden />
                Saved
              </span>
            ) : null}
            <a
              href={`/members/${profile.handle}`}
              className="ml-auto text-label font-medium text-link no-underline hover:underline"
            >
              View your profile
            </a>
          </div>
        </div>
      </div>
    </form>
  );
}

function FieldError({ message }: { message?: string }) {
  if (!message) return null;
  return (
    <p role="alert" className="text-caption font-medium text-danger">
      {message}
    </p>
  );
}

/**
 * A native checkbox drawn as a switch, so the form posts with or without
 * JavaScript. Same construction as the one in notification-settings.
 */
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
      className="flex cursor-pointer items-start justify-between gap-4 px-4 py-3.5 transition hover:bg-surface-muted sm:px-5"
    >
      <span className="min-w-0">
        <span className="flex items-center gap-1.5 text-body font-medium text-foreground">
          {icon ? (
            on ? (
              <Eye className="size-4 text-foreground-muted" aria-hidden />
            ) : (
              <EyeOff className="size-4 text-foreground-muted" aria-hidden />
            )
          ) : null}
          {label}
        </span>
        {help ? (
          <span className="mt-0.5 block text-caption text-foreground-muted">
            {help}
          </span>
        ) : null}
      </span>

      <span className="relative mt-0.5 inline-flex shrink-0">
        <input
          id={name}
          name={name}
          type="checkbox"
          role="switch"
          checked={on}
          onChange={(event) => setOn(event.target.checked)}
          className={SWITCH_TRACK}
        />
        <span className={SWITCH_THUMB} aria-hidden />
      </span>
    </label>
  );
}

const SWITCH_TRACK =
  "peer h-5 w-9 cursor-pointer appearance-none rounded-full border border-field-border bg-default transition checked:border-brand-fill checked:bg-brand-fill";
const SWITCH_THUMB =
  "pointer-events-none absolute left-0.5 top-1/2 size-4 -translate-y-1/2 rounded-full bg-foreground-muted shadow-e1 transition-transform peer-checked:translate-x-4 peer-checked:bg-brand-fill-foreground";
