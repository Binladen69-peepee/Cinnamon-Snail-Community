"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { UserCheck, UserMinus } from "lucide-react";
import { Button } from "@/components/app/ui";
import { setMemberStatusAction } from "@/app/admin/moderation/actions";

/**
 * Suspend, or reinstate, from the member's own page.
 *
 * Suspending already existed on a report; reinstating existed only as an
 * action nothing called, so a suspension could never be undone from the
 * console. Shown only where it can apply: an active member can be suspended,
 * a suspended one reinstated. Accounts being deleted are not touched here.
 */
export function MemberStatusControl({
  userId,
  name,
  status,
}: {
  userId: string;
  name: string;
  status: "ACTIVE" | "SUSPENDED";
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const suspend = status === "ACTIVE";

  function run() {
    const question = suspend
      ? `Suspend ${name}? They lose access to the community, messages and classes until reinstated.`
      : `Reinstate ${name}? Their access comes back exactly as their membership allows.`;
    if (!window.confirm(question)) return;
    const data = new FormData();
    data.set("userId", userId);
    data.set("suspend", suspend ? "1" : "0");
    setError(null);
    startTransition(async () => {
      const result = await setMemberStatusAction(data);
      if (!result.ok) setError(result.error);
      else router.refresh();
    });
  }

  return (
    <div className="flex flex-wrap items-center gap-2">
      {error ? (
        <p role="alert" className="text-caption font-medium text-danger">
          {error}
        </p>
      ) : null}
      <Button size="sm" variant={suspend ? "danger" : "primary"} disabled={pending} onClick={run}>
        {suspend ? <UserMinus className="size-4" aria-hidden /> : <UserCheck className="size-4" aria-hidden />}
        {suspend ? "Suspend" : "Reinstate"}
      </Button>
    </div>
  );
}
