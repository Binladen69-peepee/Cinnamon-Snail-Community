import { redirect } from "next/navigation";
import { KITCHEN_TABLE_PATH } from "@/lib/community/system-spaces";

/**
 * The space directory, retired (DEC-078).
 *
 * Members no longer see a list of rooms: every general room reads in the
 * Kitchen Table. The navigation sends `/spaces` there as well; this is the net
 * for a request that still reaches the page, such as an old bookmark.
 */
export default function SpacesPage() {
  redirect(KITCHEN_TABLE_PATH);
}
