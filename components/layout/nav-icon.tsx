"use client";

import Link from "next/link";
import { Tooltip } from "@heroui/react/tooltip";
import { Button } from "@heroui/react";
import {
  Bell,
  CreditCard,
  LogOut,
  MessageSquare,
  Plus,
  Search,
  Shield,
} from "lucide-react";
import type { ReactNode } from "react";

const icons = {
  search: Search,
  bell: Bell,
  create: Plus,
  messages: MessageSquare,
  membership: CreditCard,
  admin: Shield,
  logout: LogOut,
} as const;

export type NavIconName = keyof typeof icons;

const iconButtonClass =
  "relative inline-flex size-11 items-center justify-center rounded-full text-foreground hover:bg-background";

function Tip({ label, children }: { label: string; children: ReactNode }) {
  return (
    <Tooltip delay={200}>
      {children}
      <Tooltip.Content className="rounded-lg px-2.5 py-1 text-xs">{label}</Tooltip.Content>
    </Tooltip>
  );
}

export function NavIconLink({
  href,
  label,
  icon,
  badge,
}: {
  href: string;
  label: string;
  icon: NavIconName;
  badge?: number;
}) {
  const Icon = icons[icon];
  return (
    <Tip label={label}>
      <Tooltip.Trigger>
        <Link href={href} aria-label={label} className={iconButtonClass}>
          <Icon className="size-4" aria-hidden />
          {badge && badge > 0 ? (
            <span className="absolute right-1.5 top-1.5 inline-flex min-w-4 items-center justify-center rounded-full bg-terracotta px-1 text-[10px] font-bold leading-4 text-white">
              {badge > 99 ? "99+" : badge}
            </span>
          ) : null}
        </Link>
      </Tooltip.Trigger>
    </Tip>
  );
}

export function NavProfileLink({
  href,
  children,
}: {
  href: string;
  children: ReactNode;
}) {
  return (
    <Tip label="Profile">
      <Tooltip.Trigger>
        <Link href={href} aria-label="Profile" className={iconButtonClass}>
          {children}
        </Link>
      </Tooltip.Trigger>
    </Tip>
  );
}

export function NavIconSubmit({
  label,
  icon,
}: {
  label: string;
  icon: NavIconName;
}) {
  const Icon = icons[icon];
  return (
    <Tip label={label}>
      <Button isIconOnly variant="ghost" size="md" type="submit" aria-label={label}>
        <Icon className="size-4" aria-hidden />
      </Button>
    </Tip>
  );
}
