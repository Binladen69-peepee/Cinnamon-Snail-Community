# Membership & Access Review

**Date:** 2026-09-14
**Question asked:** should Kit tags, the SamCart API, or both be the source of membership access?
**Scope:** read-only review. No billing or access code was changed.

---

## Headline

The membership pipeline is fully built, tested (24 billing and entitlement tests, all passing) and
documented — and it is **not connected in production**.

`SAMCART_WEBHOOK_SECRET` is not set in any Vercel environment. `verifySamcartWebhook`
rejects before reading the body when the secret is absent, so **`/api/webhooks/samcart`
answers 401 to every request in production**. No SamCart event has ever been ingested;
no entitlement has ever been granted from a purchase.

This is not visible to members, because entitlements currently gate only lesson
playback and Learn media (`DEC-008`) — the community, spaces and feed require an
`ACTIVE` account, not a paid entitlement. So the pipeline has been dead without
symptoms.

Nothing about the client's clarification changes the architecture. It changes which
env var needs filling in.

---

## Answers

### 1. How does the platform determine active membership?

It reads the `Entitlement` table, and nothing else.

```text
userHasActiveEntitlement(userId)
  → prisma.entitlement.findMany({ where: { userId } })
  → canAccessPaidContent(rows)          lib/entitlements/check.ts
```

A row counts as active when `status === "ACTIVE"`, `revokedAt` is null, `startsAt` is
in the past, and `endsAt` is either null or in the future. Read fresh from the database
on every call — it is not cached in the JWT or session, so a change takes effect on the
member's next request.

Enforced in exactly two places today:

| Path | Gate |
|---|---|
| `app/api/learn/playback/[lessonId]/route.ts` | `memberCanPlayLessons` |
| `app/api/learn/media/[token]/route.ts` | `userHasActiveEntitlement` |

### 2. Is the Kit tag used for access control?

**No.** The dependency runs the other way. `lib/billing/apply.ts` writes the
entitlement first, then calls `syncKitForEntitlementChange` as a side effect. No
authorization path reads Kit, and nothing in the codebase can.

The premise behind option A — "keep Kit as the access source" — does not describe the
current system. Choosing it would be a change, not a continuation.

### 3. How does the platform receive Kit tag changes?

It does not. There is no inbound Kit path of any kind:

- no route under `app/api` mentions Kit
- the Kit account has **zero webhooks configured** (verified against the live account)
- nothing polls Kit

A tag added or removed in Kit today is invisible to the platform, permanently.

### 4. How quickly does access update after a Kit tag changes?

Never — see (3).

For completeness, the SamCart path: webhook verified → raw payload stored → `after()`
processes it out of band → entitlement written. Seconds. Then immediate, because the
entitlement is read per request with no session caching. Failures retry to 8 attempts
before dead-lettering.

### 5. Does the implementation handle each case correctly?

Against the code in `lib/billing/policy.ts`, and covered by tests:

| Case | Subscription | Access | Correct |
|---|---|---|---|
| Monthly | `ACTIVE` | granted | yes |
| Annual | `ACTIVE` | granted | yes |
| Cancellation | `CANCELED` | kept until SamCart's `period_end`, else revoked | yes (`DEC-001`) |
| Failed payment | `PAST_DUE` | **kept** | yes — deliberate, one failure is not eviction |
| Delinquent | `DELINQUENT` | revoked immediately | yes |
| Refund | `REFUNDED` | revoked immediately | yes |
| Expired | — | `endsAt` in the past stops counting | yes |
| Re-subscription | `ACTIVE` | revoked row reactivated, or new row | yes |

Monthly and annual are handled *identically and correctly*: `interval` is recorded on
the subscription for reporting but plays no part in access. Access length comes from
SamCart's reported `period_end`, which is the right design — an annual member is not a
different kind of access, just a longer period.

One structural note: there is a single `membership` product, mapped from three SamCart
product IDs (`1001`, `1069358`, `1069354`), carrying one Kit tag. The client's model
has two tags (Monthly, Annual). The platform does not currently distinguish them.

### 6. Is there an existing Kit webhook or API sync?

Outbound only, one way, fire-and-forget:

- `syncKitForEntitlementChange({ userId, email, tag, action })` — `lib/billing/kit.ts`
- called on grant, on revoke, on pending-grant claim, and on manual grant
- every attempt writes a `KitSyncLog` row; a missing key is logged as a failure, never
  as success

No inbound sync. No webhook. See the defects below — the outbound direction does not
currently work either.

### 7. Is there an existing SamCart integration?

Yes, and it is substantial — roughly 1,750 lines across `lib/billing/`:

| File | Role |
|---|---|
| `app/api/webhooks/samcart/route.ts` | verify → ingest → `after()` process |
| `verify.ts` | api_key on the Notify URL query string, or HMAC signature |
| `normalize.ts` | 50 SamCart event names → 12 canonical types; deterministic event IDs |
| `policy.ts` | event → subscription status, event → entitlement effect |
| `apply.ts` | writes subscription + entitlement, then Kit; `PendingGrant` for unknown emails |
| `process-event.ts` | idempotent, 8 attempts, dead-letter |
| `samcart-api.ts` | cancel, fetch subscription, fetch product, refund, list subscriptions |
| `cancel.ts` | member cancellation; local state changes only after SamCart confirms |
| `reconcile.ts` | paying/no-access auto-fix; access/not-paying, orphan and duplicate alerts |

### 8. What is lost by using Kit instead of SamCart?

A Kit tag is one bit with no timestamp. Everything below depends on information a tag
cannot carry:

- **Period-end access.** `DEC-001` says access runs to SamCart's reported `period_end`.
  A tag cannot express "cancelled, but paid through 3 October". Kit-driven access would
  have to cut off immediately on cancellation — a policy reversal, and a refund risk.
- **Failed payment vs delinquency.** Today a failed charge keeps access (`PAST_DUE`)
  and only sustained failure revokes it. Kit has one bit: tagged or not. Whichever way
  the client's automation resolves a dunning failure, the platform inherits it with no
  ability to differ.
- **Refunds.** Immediate revocation on refund. Not represented in Kit.
- **Reconciliation.** `reconcile.ts` compares local access against SamCart's live
  subscription list to catch drift. Comparing Kit against Kit detects nothing.
- **Cancellation correctness.** `/billing` refuses to mark a membership cancelled
  unless SamCart confirms (`failedCancellationDoesNotCancelLocally`). Account deletion
  is gated on the same confirmation (`DEC-010`). Neither is expressible via Kit.
- **Audit and dispute trail.** `BillingEvent` keeps every raw payload with a provider
  event ID. Kit tags have no history.
- **Money.** Amounts, currency, gateway, order and subscription IDs — all absent.

Kit is also *downstream of SamCart*: the client's tags are applied by a Kit automation
that SamCart triggers. Reading Kit for access means reading a lossy copy, one hop
later, with an extra failure mode, when the original is available.

### 9. Is the SamCart webhook secret actually required?

**Yes — it is the single thing blocking the entire pipeline.**

`verify.ts` returns `{ ok: false }` when `SAMCART_WEBHOOK_SECRET` is unset, before any
other check. It is not set in Production, Preview or Development. Every webhook is
being rejected with 401.

SamCart has no secret field of its own, so the secret travels on the Notify URL:

```text
https://<domain>/api/webhooks/samcart?api_key=<SAMCART_WEBHOOK_SECRET>
```

The value is ours to choose — any high-entropy string, set in both places. An HMAC
`x-samcart-signature` header is also accepted if SamCart is configured to send one.

`SAMCART_API_KEY` is separately required, for three things that read or write SamCart
rather than receive from it: member-initiated cancellation, reconciliation's remote
comparison, and refunds. Without it, cancellation fails closed — the member sees an
error and the subscription stays active, which is the safe direction but not a working
feature.

### 10. Can Kit reliably provide the access state the platform needs?

No — for the reasons in (8), and for one more that is decisive: there is no delivery
mechanism. Zero Kit webhooks exist, and the platform has no inbound Kit route. Kit
cannot tell the platform anything today, and building that path means building the
inbound half of an integration whose outbound half is already built against a richer
source.

Kit *can* reliably answer one different and useful question: **who is a member right
now.** That makes it a good one-time backfill source, not a runtime authority.

---

## Defects found

Read from code; not executed, since no keys are configured.

**1. Kit revoke unsubscribes from everything instead of removing a tag.**
`lib/billing/kit.ts` posts to `${KIT_BASE}/unsubscribe` on revoke. In Kit's v3 API that
is an account-level unsubscribe — it removes the person from all email. It also does
not remove the membership tag, which is what was intended. Correct v3 tag removal is
`DELETE /v3/tags/{tag_id}/subscriptions/{subscriber_id}`. Had this ever run with live
keys, a cancellation would have silently destroyed that member's newsletter
subscription.

**2. The configured Kit tags do not exist.**
`prisma/seed.ts` sets `kitTag` to `vu-member`, `vu-course`, `vu-bundle`. None of these
exist in the live Kit account. The real tags are:

| Tag | ID | Subscribers |
|---|---|---|
| Vegan University Monthly | `4545070` | 96 |
| Vegan University Annual | `4545069` | 60 |
| VU Membership Cancelled | `4595335` | 75 |

Also note the grant path interpolates the tag *name* into `/tags/{tag}/subscribe`,
where Kit v3 expects a numeric tag ID. Both the name and the shape are wrong.

**3. One product, two tags.**
The single `membership` product carries one `kitTag`, so it cannot write Monthly to
monthly subscribers and Annual to annual ones. Either the product splits in two, or
the tag is chosen from `subscription.interval` at sync time.

The existence of a populated **VU Membership Cancelled** tag also suggests the client's
live automation stamps a cancelled marker as well as removing the membership tag. Worth
confirming with them before matching the behaviour.

---

## Recommendation

### B — SamCart stays the access source. Kit keeps the job it already has.

This is deliberately the least dramatic answer available: the recommendation is to
**change no architecture at all**, because the architecture already matches the
client's described workflow. Their workflow is *SamCart is the truth, Kit reflects it*.
That is precisely what `docs/billing-architecture.md` specifies and what the code does.

What is missing is one environment variable.

Kit is not removed and keeps two jobs:

1. **Outbound tagging**, as today — so the client's email automations keep firing off
   membership changes. Defects 1–3 above need fixing first.
2. **One-time backfill.** The 156 people carrying Monthly or Annual bought before this
   platform existed; their SamCart webhooks will never be re-sent, so the webhook alone
   will never grant them access. Reading those two tags once and creating `PendingGrant`
   rows — which is exactly what `PendingGrant` exists for, claimed when the email is
   verified on an account — is the correct way to seed them.

**Option A is rejected** because it inverts a working dependency to read a lossy copy,
would force immediate cut-off on cancellation against `DEC-001`, and has no delivery
mechanism at all.

**Option C is rejected as stated** — "both together" most naturally reads as both
deciding access, and two writers to one access bit is a defect generator: a member's
access would depend on which of two systems spoke last. Kit alongside SamCart is
correct only in the strictly subordinate sense above.

### On the client's credentials

The client offered the SamCart API key as a fallback, on the assumption it may not be
needed. The review finds the opposite, and this should be told to them plainly:

| Credential | Needed? | Why |
|---|---|---|
| `SAMCART_WEBHOOK_SECRET` | **Yes — blocking** | Nothing works without it. Ours to choose; goes on the Notify URL. |
| `SAMCART_API_KEY` | **Yes** | Member cancellation, reconciliation, refunds. |
| `KIT_API_KEY` / `KIT_API_SECRET` | Yes, for outbound tags | Not on the access path; no member is blocked without it. |

So: the SamCart credentials are required, and the webhook secret is the one item on the
critical path. Nothing needs to be built to use them — only configured.

---

## Not done

Deliberately left alone, pending the client's decision:

- setting `SAMCART_WEBHOOK_SECRET` and the SamCart Notify URL
- fixing the three Kit defects
- the one-time Kit backfill of the 156 existing members
- splitting Monthly/Annual, if the two tags need to be written separately
