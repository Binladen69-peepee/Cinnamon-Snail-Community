import Link from "next/link";

const columns = [
  {
    title: "Product",
    links: [
      { href: "/membership", label: "Membership" },
      { href: "/login", label: "Member sign in" },
      { href: "/events", label: "Events" },
    ],
  },
  {
    title: "Community",
    links: [
      { href: "/community", label: "Kitchen Table" },
      { href: "/about", label: "How the table works" },
    ],
  },
  {
    title: "Courses",
    links: [{ href: "/courses", label: "Course catalog" }],
  },
  {
    title: "Company",
    links: [
      { href: "/about", label: "About" },
      { href: "/faq", label: "FAQ" },
    ],
  },
  {
    title: "Legal",
    links: [
      { href: "/terms", label: "Terms" },
      { href: "/privacy", label: "Privacy" },
    ],
  },
];

export function MarketingFooter() {
  return (
    <footer className="mt-8 bg-[var(--cta-fill)] text-[var(--cta-fill-foreground)]">
      <div className="vu-gutter">
        <div className="vu-shell grid gap-10 py-16 md:grid-cols-[minmax(0,1.2fr)_minmax(0,2fr)]">
        <div>
          <p className="text-2xl font-extrabold tracking-tight">Vegan University</p>
          <p className="prose-measure mt-3 text-sm text-white/75 dark:text-paper/75">
            A digital home for people learning to cook plants with confidence,
            community, and care — a school that still looks like a kitchen.
          </p>
          <p className="mt-6 text-sm text-white/70 dark:text-paper/70">
            Public social handles are not published yet. We will not link empty
            profiles.
          </p>
        </div>
        <div className="grid grid-cols-2 gap-8 sm:grid-cols-3 lg:grid-cols-5">
          {columns.map((column) => (
            <div key={column.title}>
              <p className="text-xs font-bold uppercase tracking-[0.16em] text-accent">
                {column.title}
              </p>
              <ul className="mt-3 space-y-2 text-sm">
                {column.links.map((link) => (
                  <li key={link.href + link.label}>
                    <Link
                      href={link.href}
                      className="text-white/90 hover:text-accent dark:text-paper/90"
                    >
                      {link.label}
                    </Link>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>
        </div>
      </div>
    </footer>
  );
}
