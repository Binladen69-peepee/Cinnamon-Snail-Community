export const dynamic = "force-dynamic";

export const metadata = {
  robots: { index: false, follow: false },
};

/**
 * A pass-through.
 *
 * The frame is `AppShell`, and each page renders it directly rather than
 * inheriting it here, because what belongs in the right rail depends on the
 * page — the feed shows what to do next, a space shows its About card, and
 * Settings wants nothing there at all. A layout cannot know that, and threading
 * a rail through one would mean every page pushing data upward.
 *
 * The cost is one `<AppShell>` per page; the benefit is that the rail is a real
 * slot instead of a special case.
 */
export default function MemberLayout({ children }: { children: React.ReactNode }) {
  return children;
}
