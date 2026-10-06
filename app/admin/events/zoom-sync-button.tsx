"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { Loader2, RefreshCw } from "lucide-react";
import { syncZoomNowAction } from "@/app/admin/events/actions";
import { Button } from "@/components/app/ui";
import { toast } from "@/components/ui/toast";

/**
 * "Sync from Zoom now", for staff who just set up a LIVE CLASS meeting and do
 * not want to wait for the next scheduled run. The result is a toast; the
 * lasting record is the status card beside it, which refreshes with the run.
 */
export function ZoomSyncButton({ configured }: { configured: boolean }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();

  function sync() {
    startTransition(async () => {
      const result = await syncZoomNowAction();
      if (!result.ok) {
        toast.danger(result.error);
        router.refresh();
        return;
      }
      const changed = [
        result.created ? `${result.created} new` : null,
        result.updated ? `${result.updated} updated` : null,
        result.canceled ? `${result.canceled} canceled` : null,
      ].filter(Boolean);
      const summary =
        changed.length > 0
          ? `Synced from Zoom: ${changed.join(", ")}.`
          : "Synced from Zoom. Everything was already up to date.";
      if (result.warnings.length > 0) {
        toast.warning(`${summary} Some meetings could not be read; see the status.`);
      } else {
        toast.success(summary);
      }
      router.refresh();
    });
  }

  return (
    <Button
      size="sm"
      onClick={sync}
      disabled={!configured || pending}
      aria-describedby={configured ? undefined : "zoom-not-configured"}
    >
      {pending ? (
        <Loader2 className="size-4 animate-spin" aria-hidden />
      ) : (
        <RefreshCw className="size-4" aria-hidden />
      )}
      {pending ? "Syncing" : "Sync from Zoom now"}
    </Button>
  );
}
