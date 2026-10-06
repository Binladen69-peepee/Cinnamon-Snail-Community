import "server-only";
import { revalidatePath } from "next/cache";
import { LIVE_CLASSES_PATH, liveClassHref } from "@/lib/events/paths";

/**
 * Refresh every page that shows live classes after a change.
 *
 * Callable from anywhere: outside a request (a test, a script) Next has no
 * cache to invalidate and `revalidatePath` throws, which is not a reason for a
 * sync that already succeeded to report a failure. The member pages render per
 * request anyway; this is for the admin list, the Kitchen Table rail and the
 * public `/events` listing.
 */
export function revalidateLiveClasses(slugs: Iterable<string> = []): void {
  try {
    revalidatePath(LIVE_CLASSES_PATH);
    revalidatePath("/admin/events");
    revalidatePath("/kitchen-table");
    revalidatePath("/events");
    for (const slug of slugs) {
      revalidatePath(liveClassHref(slug));
      revalidatePath(`/admin/events/${slug}`);
    }
  } catch {
    // Outside a request: nothing is cached, so nothing needs refreshing.
  }
}
