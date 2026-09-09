# Billing Architecture

SamCart is the source of truth for **money**.  
Vegan University is the source of truth for **access**.  
Authorization reads **entitlements only**.

```text
SamCart
  → verified webhook
  → billing_events (raw payload + provider event id)
  → background job (idempotent)
  → subscriptions
  → entitlements
  → application authorization
```

Kit is a side effect of entitlement changes, never a runtime access check.

Tables: `Product`, `SamcartProductMap`, `Subscription`, `Entitlement`, `BillingEvent`, `KitSyncLog`, `PendingGrant`, `CancellationRequest`, `ReconciliationRun`, `ReconciliationFinding`.

## Webhooks

`POST /api/webhooks/samcart`

1. Verify `api_key` against `SAMCART_WEBHOOK_SECRET`, or HMAC `x-samcart-signature`.
2. Store the raw payload with a deterministic `providerEventId`.
3. Return 200.
4. Process with Next.js `after()` (`DEC-011`). Failures increment `attempts` and dead-letter after 8 tries.
5. Duplicate provider IDs are no-ops.

SamCart Notify URL types are mapped in `lib/billing/normalize.ts`. Unmapped products are audited and not invented. Unmatched customer emails become `PendingGrant` rows and are claimed when that email is verified on an account.

## Access

Authorization reads entitlements only (`lib/entitlements`).

| Event | Subscription | Entitlement |
|---|---|---|
| Purchase / charge / recovered / restarted | ACTIVE | Grant |
| Charge failed | PAST_DUE | Keep |
| Delinquent | DELINQUENT | Revoke now |
| Refund | REFUNDED | Revoke now |
| Canceled / completed / cancel scheduled | CANCELED or CANCELING | Keep until `periodEnd` if SamCart sent one; otherwise revoke |

`DEC-001` is accepted: access follows the period SamCart reports. The 1-month trial products `1069358` and `1069354` map to membership and need no extra period logic.

## Cancellation

`/billing` → save/confirm → SamCart API → local update only after confirmation → Kit attempt → email → audit. A failed SamCart call leaves the subscription active. Public marketing stays at `/membership`.

## Reconciliation

`POST /api/jobs/billing?job=reconcile`

- Paying / no access: auto-grant
- Access / not paying (non-manual): alert only
- Orphaned and duplicate subscriptions: alert
- Email sent even on a clean day when `BILLING_ALERT_EMAIL` or `EMAIL_FROM` is set

## Kit

Kit is a side effect. Missing keys are logged as failed syncs, never as success.

Do not claim a cancellation succeeded unless SamCart confirms it.
