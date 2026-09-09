import Link from "next/link";
import { Home, Users, BookOpen, Map, UserRound, Plus } from "lucide-react";

const items = [
  { href: "/home", label: "Home", icon: Home },
  { href: "/spaces", label: "Community", icon: Users },
  { href: "/learn", label: "Courses", icon: BookOpen },
  { href: "/roadmap", label: "Roadmap", icon: Map },
  { href: "/settings", label: "Profile", icon: UserRound },
];

export function MobileNav() {
  return (
    <nav
      className="fixed inset-x-4 bottom-4 z-40 md:hidden"
      aria-label="Primary"
    >
      <ul className="vu-card relative grid grid-cols-5 px-2 py-2">
        {items.map((item) => (
          <li key={item.href}>
            <Link
              href={item.href}
              className="flex min-h-12 flex-col items-center justify-center gap-1 text-[11px] font-semibold text-foreground"
            >
              <item.icon className="h-5 w-5" aria-hidden />
              {item.label}
            </Link>
          </li>
        ))}
      </ul>
      <Link
        href="/compose"
        className="absolute -top-5 right-3 flex size-12 items-center justify-center rounded-full bg-foreground text-primary-foreground shadow-[0_10px_40px_rgba(26,26,26,0.12)]"
        aria-label="Create a post"
      >
        <Plus className="h-5 w-5" />
      </Link>
    </nav>
  );
}
