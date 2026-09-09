# Incident Runbook

## Health

`GET /api/health` must return `{ ok: true }`.

## Auth outage

- Confirm `AUTH_SECRET` and `AUTH_URL`
- Magic links: Resend dashboard or server console
- Revoke sessions from settings or by marking `Session.revokedAt`

## Billing

- Do not grant access by editing the UI. Use `/admin/billing` manual grant, which writes an entitlement and an audit row.
- Notify URL: `POST /api/webhooks/samcart` with `SAMCART_WEBHOOK_SECRET`.
- Inspect `BillingEvent` for duplicate `providerEventId` (idempotency).
- Retry: `POST /api/jobs/billing?job=retry`. Dead-lettered events need a human.
- Reconciliation: `POST /api/jobs/billing?job=reconcile`. Paying/no-access is auto-fixed; access/not-paying is alert-only.
- Never tell a member cancellation worked unless `CancellationRequest.samcartConfirmedAt` is set.
- High-priority billing failures must alert the responsible admin (`BILLING_ALERT_EMAIL`).

## Data

Daily backups and a tested restore are a Phase 7 launch gate. Until then, take database snapshots before destructive operations.
