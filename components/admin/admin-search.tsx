"use client";

import { UrlSearchField } from "@/components/app/url-search-field";

/**
 * The console's search field.
 *
 * A thin wrapper over the member app's `UrlSearchField` rather than a second
 * implementation: the behaviour wanted here is identical -- query in the URL,
 * type-ahead that replaces rather than pushes history, still a working form
 * without JavaScript -- and the field paints from role tokens, so the console's
 * dark scope restyles it with no work.
 */
export function AdminSearch(props: {
  placeholder: string;
  label: string;
  resetParams?: string[];
}) {
  return <UrlSearchField {...props} />;
}
