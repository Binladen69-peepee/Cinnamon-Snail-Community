"use client";

/**
 * Toasts, re-exported from HeroUI rather than reimplemented.
 *
 * `@heroui/react` is already a dependency and already wrapped this way for
 * Button, EmptyState and Skeleton, so this follows the house pattern: one
 * import path for the app, the vendor's component untouched underneath. The
 * provider is mounted once in `app/providers.tsx`.
 *
 * Use it for the result of an action the member took — posted, saved, revoked,
 * sign-in failed. Not for validation a form can state inline next to the field
 * that is wrong, and never for anything the member has to read to stay correct:
 * a toast disappears.
 */
export { Toast, toast } from "@heroui/react/toast";
