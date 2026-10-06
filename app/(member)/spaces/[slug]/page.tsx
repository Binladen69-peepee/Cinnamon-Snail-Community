import { redirect } from "next/navigation";
import {
  IDEAS_PATH,
  IDEAS_SLUG,
  KITCHEN_TABLE_PATH,
} from "@/lib/community/system-spaces";

/**
 * A room's page, retired (DEC-078).
 *
 * Its posts read in the Kitchen Table now (or on the Ideas board, for that
 * one room), so an old link to a room lands where the conversation went. The
 * room's settings and review queue stay at `/spaces/<slug>/settings` and
 * `/review` for the people who run it.
 */
export default async function SpacePage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  redirect(slug === IDEAS_SLUG ? IDEAS_PATH : KITCHEN_TABLE_PATH);
}
