"use client";

import { UrlSearchField } from "@/components/app/url-search-field";
import { cn } from "@/lib/utils";

/**
 * The console's search field.
 *
 * A thin wrapper over the member app's `UrlSearchField` rather than a second
 * implementation: the behaviour wanted here is identical -- query in the URL,
 * type-ahead that replaces rather than pushes history, still a working form
 * without JavaScript.
 *
 * The console's fields are `fieldClass` fields (components/app/ui.tsx): the
 * field border, the field ground and a 40px height, the large field size. The
 * shared component draws its own input, so the wrapper brings it onto that
 * spec from outside rather than forking it.
 */
const FIELD_SPEC = cn(
  "[&_input]:h-10 [&_input]:border-field-border [&_input]:bg-field-background",
  "[&_input]:text-body [&_input]:text-field-foreground",
  "[&_input]:placeholder:text-field-placeholder",
);

export function AdminSearch(props: {
  placeholder: string;
  label: string;
  resetParams?: string[];
}) {
  return <UrlSearchField {...props} className={FIELD_SPEC} />;
}
