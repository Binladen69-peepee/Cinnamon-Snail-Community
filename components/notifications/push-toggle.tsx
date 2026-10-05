"use client";

import { useEffect, useState, useTransition } from "react";
import { BellRing, BellOff } from "lucide-react";
import { toast } from "@/components/ui/toast";
import { Button, Card } from "@/components/app/ui";
import {
  subscribePushAction,
  unsubscribePushAction,
} from "@/app/(member)/settings/notification-actions";

type Status =
  | "checking"
  | "unsupported"
  | "ios-install"
  | "unavailable"
  | "denied"
  | "off"
  | "on";

/**
 * Turns push on or off for this browser.
 *
 * Push is per device, not per account: the switches below say which
 * categories may be pushed, and this says whether *this* browser receives
 * them. The permission prompt only ever appears because the member pressed
 * the button — never on page load.
 */
export function PushToggle({
  available,
  publicKey,
  devices,
}: {
  available: boolean;
  publicKey: string | null;
  devices: number;
}) {
  const [status, setStatus] = useState<Status>("checking");
  const [pending, startTransition] = useTransition();

  useEffect(() => {
    let cancelled = false;
    detect(available).then((next) => {
      if (!cancelled) setStatus(next);
    });
    return () => {
      cancelled = true;
    };
  }, [available]);

  function enable() {
    if (!publicKey) return;
    startTransition(async () => {
      try {
        const permission = await Notification.requestPermission();
        if (permission !== "granted") {
          setStatus(permission === "denied" ? "denied" : "off");
          return;
        }
        const registration = await navigator.serviceWorker.register("/sw.js", { scope: "/" });
        await navigator.serviceWorker.ready;
        const subscription =
          (await registration.pushManager.getSubscription()) ??
          (await registration.pushManager.subscribe({
            userVisibleOnly: true,
            applicationServerKey: base64UrlToBytes(publicKey),
          }));
        const result = await subscribePushAction(subscription.toJSON());
        if (!result.ok) {
          await subscription.unsubscribe().catch(() => undefined);
          toast.danger(result.error);
          return;
        }
        setStatus("on");
        toast.success("Push notifications are on for this browser.");
      } catch {
        toast.danger("This browser would not turn on push notifications.");
      }
    });
  }

  function disable() {
    startTransition(async () => {
      try {
        const registration = await navigator.serviceWorker.getRegistration("/");
        const subscription = await registration?.pushManager.getSubscription();
        if (subscription) {
          await unsubscribePushAction(subscription.endpoint);
          await subscription.unsubscribe();
        }
        setStatus("off");
        toast.success("Push notifications are off for this browser.");
      } catch {
        toast.danger("Could not turn push off. Try again.");
      }
    });
  }

  const on = status === "on";
  const text: Record<Status, string> = {
    checking: "Checking this browser…",
    unsupported: "This browser does not support push notifications.",
    "ios-install":
      "On iPhone and iPad, add Vegan University to your Home Screen first (Share → Add to Home Screen), then turn push on from there.",
    unavailable: "Push notifications are not switched on for the site yet.",
    denied:
      "Notifications are blocked for this site in your browser settings. Allow them there, then come back.",
    off:
      devices > 0
        ? `Off for this browser. On for ${devices} other ${devices === 1 ? "device" : "devices"}.`
        : "Get replies, messages and reminders even when the app is closed.",
    on: "On for this browser.",
  };

  return (
    <Card as="div" className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between sm:gap-4">
      <div className="flex min-w-0 items-start gap-3">
        <span
          className="grid size-9 shrink-0 place-items-center rounded-full bg-brand-wash text-on-brand-wash"
          aria-hidden
        >
          {on ? <BellRing className="size-4" /> : <BellOff className="size-4" />}
        </span>
        <div className="min-w-0">
          <p className="text-body font-semibold text-foreground">Push on this device</p>
          <p className="mt-0.5 text-label text-foreground-muted" aria-live="polite">
            {text[status]}
          </p>
        </div>
      </div>
      {status === "off" || status === "on" ? (
        <Button
          onClick={on ? disable : enable}
          disabled={pending}
          className="self-start sm:self-auto"
        >
          {pending ? "Working…" : on ? "Turn off" : "Turn on"}
        </Button>
      ) : null}
    </Card>
  );
}

async function detect(available: boolean): Promise<Status> {
  if (typeof window === "undefined") return "checking";
  const ios = /iPad|iPhone|iPod/.test(navigator.userAgent);
  const standalone =
    window.matchMedia?.("(display-mode: standalone)").matches ||
    (navigator as Navigator & { standalone?: boolean }).standalone === true;
  if (!("serviceWorker" in navigator) || !("PushManager" in window) || !("Notification" in window)) {
    return ios && !standalone ? "ios-install" : "unsupported";
  }
  if (!available) return "unavailable";
  if (Notification.permission === "denied") return "denied";
  try {
    const registration = await navigator.serviceWorker.getRegistration("/");
    const subscription = await registration?.pushManager.getSubscription();
    return subscription && Notification.permission === "granted" ? "on" : "off";
  } catch {
    return "off";
  }
}

function base64UrlToBytes(value: string): Uint8Array<ArrayBuffer> {
  const padding = "=".repeat((4 - (value.length % 4)) % 4);
  const base64 = (value + padding).replace(/-/g, "+").replace(/_/g, "/");
  const raw = atob(base64);
  const bytes = new Uint8Array(new ArrayBuffer(raw.length));
  for (let index = 0; index < raw.length; index += 1) bytes[index] = raw.charCodeAt(index);
  return bytes;
}
