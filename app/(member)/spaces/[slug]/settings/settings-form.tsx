"use client";

import { useState, useTransition } from "react";
import { Loader2 } from "lucide-react";
import { updateSpaceSettingsAction } from "@/app/(member)/spaces/actions";
import { toast } from "@/components/ui/toast";
import {
  NOTIFICATION_COPY,
  NOTIFICATION_LEVELS,
  POSTING_COPY,
  POSTING_PERMISSIONS,
  SPACE_KINDS,
  SPACE_VISIBILITIES,
  VISIBILITY_COPY,
} from "@/lib/spaces/settings";
import { SPACE_KIND_BLURB, SPACE_KIND_LABEL } from "@/lib/spaces/kinds";
import { cn } from "@/lib/utils";

/**
 * What a space is, in one form.
 *
 * Each choice says what it does rather than naming the value behind it:
 * "Anyone, after review" instead of APPROVAL_REQUIRED. These settings decide
 * who can see and say what, and a host should not have to guess at an enum to
 * get it right.
 *
 * Nothing here is trusted. Every field is checked again on the server, which
 * is also where the permission lives — this form is a convenience for the
 * person who is already allowed to use it.
 */
export function SpaceSettingsForm({
  space,
  groups,
  products,
  canSetProduct,
}: {
  space: {
    id: string;
    slug: string;
    name: string;
    description: string | null;
    icon: string | null;
    coverUrl: string | null;
    kind: string;
    visibility: string;
    postingPermission: string;
    notificationDefault: string;
    sortOrder: number;
    groupId: string | null;
    productId: string | null;
  };
  groups: { id: string; name: string }[];
  products: { id: string; name: string }[];
  canSetProduct: boolean;
}) {
  const [pending, startTransition] = useTransition();
  const [kind, setKind] = useState(space.kind);
  const [visibility, setVisibility] = useState(space.visibility);
  const [posting, setPosting] = useState(space.postingPermission);
  const [notify, setNotify] = useState(space.notificationDefault);

  function onSubmit(formData: FormData) {
    startTransition(async () => {
      const result = await updateSpaceSettingsAction(formData);
      if (result.ok) toast.success("Space settings saved.");
      else toast.danger(result.error);
    });
  }

  return (
    <form action={onSubmit} className="space-y-6">
      <input type="hidden" name="spaceId" value={space.id} />
      <input type="hidden" name="kind" value={kind} />
      <input type="hidden" name="visibility" value={visibility} />
      <input type="hidden" name="postingPermission" value={posting} />
      <input type="hidden" name="notificationDefault" value={notify} />

      <Section title="Name and description" hint="How the room introduces itself.">
        <Labelled label="Name" htmlFor="space-name">
          <input
            id="space-name"
            name="name"
            required
            minLength={2}
            maxLength={80}
            defaultValue={space.name}
            className={FIELD}
          />
        </Labelled>
        <Labelled label="Description" htmlFor="space-description">
          <textarea
            id="space-description"
            name="description"
            rows={3}
            maxLength={500}
            defaultValue={space.description ?? ""}
            className={cn(FIELD, "h-auto py-2")}
          />
        </Labelled>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <Labelled
            label="Icon"
            htmlFor="space-icon"
            hint="A single emoji, shown beside the name in the sidebar."
          >
            <input
              id="space-icon"
              name="icon"
              maxLength={8}
              defaultValue={space.icon ?? ""}
              placeholder="🍲"
              className={FIELD}
            />
          </Labelled>
          <Labelled
            label="Order"
            htmlFor="space-sort"
            hint="Lower numbers sit higher in the sidebar."
          >
            <input
              id="space-sort"
              name="sortOrder"
              type="number"
              step={1}
              defaultValue={space.sortOrder}
              className={FIELD}
            />
          </Labelled>
        </div>
        <Labelled
          label="Cover image URL"
          htmlFor="space-cover"
          hint="Shown as the banner at the top of the space."
        >
          <input
            id="space-cover"
            name="coverUrl"
            type="url"
            defaultValue={space.coverUrl ?? ""}
            placeholder="https://"
            className={FIELD}
          />
        </Labelled>
        <Labelled label="Section" htmlFor="space-group" hint="Where it is filed in the sidebar.">
          <select
            id="space-group"
            name="groupId"
            defaultValue={space.groupId ?? ""}
            className={FIELD}
          >
            <option value="">No section</option>
            {groups.map((group) => (
              <option key={group.id} value={group.id}>
                {group.name}
              </option>
            ))}
          </select>
        </Labelled>
      </Section>

      <Section title="What kind of space" hint="Decides which tabs the space opens with.">
        <Choices
          name="kind"
          value={kind}
          onChange={setKind}
          options={SPACE_KINDS.map((value) => ({
            value,
            label: SPACE_KIND_LABEL[value] ?? value,
            hint: SPACE_KIND_BLURB[value] ?? "",
          }))}
        />
      </Section>

      <Section title="Who can see it" hint="Enforced on the server, not only here.">
        <Choices
          name="visibility"
          value={visibility}
          onChange={setVisibility}
          options={SPACE_VISIBILITIES.map((value) => ({
            value,
            label: VISIBILITY_COPY[value].label,
            hint: VISIBILITY_COPY[value].hint,
          }))}
        />
      </Section>

      <Section title="Who can post">
        <Choices
          name="postingPermission"
          value={posting}
          onChange={setPosting}
          options={POSTING_PERMISSIONS.map((value) => ({
            value,
            label: POSTING_COPY[value].label,
            hint: POSTING_COPY[value].hint,
          }))}
        />
      </Section>

      <Section
        title="Notifications"
        hint="What members get by default. Anyone can change it for themselves."
      >
        <Choices
          name="notificationDefault"
          value={notify}
          onChange={setNotify}
          options={NOTIFICATION_LEVELS.map((value) => ({
            value,
            label: NOTIFICATION_COPY[value].label,
            hint: NOTIFICATION_COPY[value].hint,
          }))}
        />
      </Section>

      <Section
        title="Membership product"
        hint={
          canSetProduct
            ? "Members without this product cannot open the space, whatever else it says."
            : "Only staff can change what a space is sold with."
        }
      >
        {canSetProduct ? (
          <select name="productId" defaultValue={space.productId ?? ""} className={FIELD}>
            <option value="">Open to every member</option>
            {products.map((product) => (
              <option key={product.id} value={product.id}>
                {product.name}
              </option>
            ))}
          </select>
        ) : (
          <p className="text-[13.5px] text-foreground-muted">
            {space.productId
              ? "This space comes with a paid membership."
              : "This space is open to every member."}
          </p>
        )}
      </Section>

      <div className="flex flex-wrap items-center gap-3 border-t border-border pt-5">
        <button
          type="submit"
          disabled={pending}
          aria-busy={pending}
          className="vu-btn vu-btn-primary inline-flex h-11 items-center gap-2 px-4 text-[14px]"
        >
          {pending ? <Loader2 className="size-4 animate-spin" aria-hidden /> : null}
          {pending ? "Saving…" : "Save settings"}
        </button>
        <a href={`/spaces/${space.slug}`} className="text-[13.5px] text-foreground-muted underline">
          Back to the space
        </a>
      </div>
    </form>
  );
}

const FIELD =
  "h-11 w-full rounded-ctl border border-field-border bg-field-background px-3 text-[14.5px] text-foreground outline-none transition placeholder:text-field-placeholder focus:border-brand focus:ring-2 focus:ring-brand/20";

function Section({
  title,
  hint,
  children,
}: {
  title: string;
  hint?: string;
  children: React.ReactNode;
}) {
  return (
    <section className="space-y-3 rounded-card border border-border bg-surface p-5">
      <div>
        <h2 className="text-[15px] font-bold text-foreground">{title}</h2>
        {hint ? (
          <p className="mt-0.5 text-[13px] text-foreground-muted">{hint}</p>
        ) : null}
      </div>
      {children}
    </section>
  );
}

function Labelled({
  label,
  htmlFor,
  hint,
  children,
}: {
  label: string;
  htmlFor: string;
  hint?: string;
  children: React.ReactNode;
}) {
  return (
    <div>
      <label
        htmlFor={htmlFor}
        className="mb-1.5 block text-[12.5px] font-semibold text-foreground"
      >
        {label}
      </label>
      {children}
      {hint ? (
        <p className="mt-1.5 text-[12px] text-foreground-muted">{hint}</p>
      ) : null}
    </div>
  );
}

/**
 * A radio group that looks like a list of decisions.
 *
 * Real radios underneath, so the keyboard and screen readers behave, with the
 * label and its consequence both visible. A select would hide the consequence
 * behind a click.
 */
function Choices({
  name,
  value,
  onChange,
  options,
}: {
  name: string;
  value: string;
  onChange: (next: string) => void;
  options: { value: string; label: string; hint: string }[];
}) {
  return (
    <div role="radiogroup" aria-label={name} className="space-y-2">
      {options.map((option) => {
        const active = value === option.value;
        return (
          <label
            key={option.value}
            className={cn(
              "flex cursor-pointer items-start gap-3 rounded-ctl border p-3 transition",
              active
                ? "border-foreground bg-background"
                : "border-border hover:border-foreground/40",
            )}
          >
            <input
              type="radio"
              name={`${name}-choice`}
              value={option.value}
              checked={active}
              onChange={() => onChange(option.value)}
              className="mt-0.5 size-4 shrink-0 accent-foreground"
            />
            <span className="min-w-0">
              <span className="block text-[13.5px] font-semibold text-foreground">
                {option.label}
              </span>
              {option.hint ? (
                <span className="mt-0.5 block text-[12.5px] leading-relaxed text-foreground-muted">
                  {option.hint}
                </span>
              ) : null}
            </span>
          </label>
        );
      })}
    </div>
  );
}
