"use client";

import { useState, useTransition } from "react";
import { Loader2 } from "lucide-react";
import { updateSpaceSettingsAction } from "@/app/(member)/spaces/actions";
import { toast } from "@/components/ui/toast";
import {
  Button,
  ButtonLink,
  Field,
  FormSection,
  Input,
  Select,
  Textarea,
} from "@/components/app/ui";
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

/** Each form section: hairlines between them, not a card around each one. */
const SECTION = "py-8 first:pt-0";

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
    <form action={onSubmit} className="flex flex-col">
      <input type="hidden" name="spaceId" value={space.id} />
      <input type="hidden" name="kind" value={kind} />
      <input type="hidden" name="visibility" value={visibility} />
      <input type="hidden" name="postingPermission" value={posting} />
      <input type="hidden" name="notificationDefault" value={notify} />

      <div className="flex flex-col divide-y divide-border">
        <FormSection
          title="Name and description"
          description="How the room introduces itself."
          className={SECTION}
        >
          <Field label="Name" htmlFor="space-name">
            <Input
              id="space-name"
              name="name"
              required
              minLength={2}
              maxLength={80}
              defaultValue={space.name}
            />
          </Field>
          <Field label="Description" htmlFor="space-description">
            <Textarea
              id="space-description"
              name="description"
              rows={3}
              maxLength={500}
              defaultValue={space.description ?? ""}
            />
          </Field>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <Field
              label="Icon"
              htmlFor="space-icon"
              hint="A single emoji, shown beside the name in the sidebar."
            >
              <Input
                id="space-icon"
                name="icon"
                maxLength={8}
                defaultValue={space.icon ?? ""}
                placeholder="🍲"
              />
            </Field>
            <Field
              label="Order"
              htmlFor="space-sort"
              hint="Lower numbers sit higher in the sidebar."
            >
              <Input
                id="space-sort"
                name="sortOrder"
                type="number"
                step={1}
                defaultValue={space.sortOrder}
              />
            </Field>
          </div>
          <Field
            label="Cover image URL"
            htmlFor="space-cover"
            hint="Shown as the banner at the top of the space."
          >
            <Input
              id="space-cover"
              name="coverUrl"
              type="url"
              defaultValue={space.coverUrl ?? ""}
              placeholder="https://"
            />
          </Field>
          <Field label="Section" htmlFor="space-group" hint="Where it is filed in the sidebar.">
            <Select id="space-group" name="groupId" defaultValue={space.groupId ?? ""}>
              <option value="">No section</option>
              {groups.map((group) => (
                <option key={group.id} value={group.id}>
                  {group.name}
                </option>
              ))}
            </Select>
          </Field>
        </FormSection>

        <FormSection
          title="What kind of space"
          description="Decides which tabs the space opens with."
          className={SECTION}
        >
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
        </FormSection>

        <FormSection
          title="Who can see it"
          description="Enforced on the server, not only here."
          className={SECTION}
        >
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
        </FormSection>

        <FormSection title="Who can post" className={SECTION}>
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
        </FormSection>

        <FormSection
          title="Notifications"
          description="What members get by default. Anyone can change it for themselves."
          className={SECTION}
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
        </FormSection>

        <FormSection
          title="Membership product"
          description={
            canSetProduct
              ? "Members without this product cannot open the space, whatever else it says."
              : "Only staff can change what a space is sold with."
          }
          className={SECTION}
        >
          {canSetProduct ? (
            <Select
              name="productId"
              defaultValue={space.productId ?? ""}
              aria-label="Membership product"
            >
              <option value="">Open to every member</option>
              {products.map((product) => (
                <option key={product.id} value={product.id}>
                  {product.name}
                </option>
              ))}
            </Select>
          ) : (
            <p className="text-body text-foreground-muted">
              {space.productId
                ? "This space comes with a paid membership."
                : "This space is open to every member."}
            </p>
          )}
        </FormSection>
      </div>

      {/* The save row stays in reach on a long form. Below `md` the tab bar
          owns the bottom of the screen, so there it simply ends the form. */}
      <div className="flex flex-wrap items-center gap-2 border-t border-border bg-background py-4 md:sticky md:bottom-0 md:z-10">
        <Button type="submit" variant="primary" disabled={pending} aria-busy={pending}>
          {pending ? <Loader2 className="size-4 animate-spin" aria-hidden /> : null}
          {pending ? "Saving…" : "Save settings"}
        </Button>
        <ButtonLink href={`/spaces/${space.slug}`} variant="ghost">
          Back to the space
        </ButtonLink>
      </div>
    </form>
  );
}

/**
 * A radio group that looks like a list of decisions.
 *
 * Real radios underneath, so the keyboard and screen readers behave, with the
 * label and its consequence both visible. A select would hide the consequence
 * behind a click. One card with a row per option; the chosen row takes the
 * brand wash, the same "selected" every other control in the app uses.
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
    <div
      role="radiogroup"
      aria-label={name}
      className="divide-y divide-separator overflow-hidden rounded-card border border-border bg-surface shadow-e1"
    >
      {options.map((option) => {
        const active = value === option.value;
        return (
          <label
            key={option.value}
            className={cn(
              "flex cursor-pointer items-start gap-3 px-4 py-3 transition",
              active ? "bg-brand-wash" : "hover:bg-surface-muted",
            )}
          >
            <input
              type="radio"
              name={`${name}-choice`}
              value={option.value}
              checked={active}
              onChange={() => onChange(option.value)}
              className="mt-0.5 size-4 shrink-0"
            />
            <span className="min-w-0">
              <span className="block text-body font-medium text-foreground">
                {option.label}
              </span>
              {option.hint ? (
                <span className="mt-0.5 block text-label text-foreground-muted">
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
