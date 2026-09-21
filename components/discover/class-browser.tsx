import { ClassTile } from "@/components/learn/class-tile";
import type { DiscoverClass } from "@/lib/community/discover";

/**
 * Discover's slice of the class catalog.
 *
 * This was a client component wrapping a panel, because a class had nowhere to
 * open: `/learn/[slug]` was Phase 7 and did not exist, so fifty-two linked
 * cards would have been fifty-two 404s. The route exists now, so the panel is
 * deleted and the cards link there like every other class card -- one
 * destination for a class, and no second place it can be read from.
 *
 * That takes this back to a plain server component: no state, no dialog.
 */
export function ClassBrowser({ classes }: { classes: DiscoverClass[] }) {
  return (
    <ul className="grid grid-cols-2 gap-3 sm:grid-cols-3 xl:grid-cols-4">
      {classes.map((cls, index) => (
        <li key={cls.slug}>
          <ClassTile cls={cls} eager={index < 4} />
        </li>
      ))}
    </ul>
  );
}
