"use client";

import { usePathname } from "next/navigation";
import { adminPageTitle } from "@/lib/admin/nav";

/** The top bar's title: the rail section the open page belongs to. */
export function AdminPageTitle({ className }: { className?: string }) {
  return <p className={className}>{adminPageTitle(usePathname())}</p>;
}
