ALTER TABLE "Product" ADD COLUMN "kitTag" TEXT;

ALTER TABLE "BillingEvent" ADD COLUMN "attempts" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "BillingEvent" ADD COLUMN "deadLetteredAt" TIMESTAMP(3);

CREATE INDEX "BillingEvent_failedAt_deadLetteredAt_idx" ON "BillingEvent"("failedAt", "deadLetteredAt");

CREATE TABLE "PendingGrant" (
    "id" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "productId" TEXT NOT NULL,
    "samcartSubscriptionId" TEXT,
    "samcartOrderId" TEXT,
    "samcartCustomerId" TEXT,
    "source" TEXT NOT NULL,
    "claimedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PendingGrant_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "PendingGrant_email_claimedAt_idx" ON "PendingGrant"("email", "claimedAt");

ALTER TABLE "PendingGrant" ADD CONSTRAINT "PendingGrant_productId_fkey" FOREIGN KEY ("productId") REFERENCES "Product"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

CREATE TABLE "CancellationRequest" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "subscriptionId" TEXT NOT NULL,
    "status" TEXT NOT NULL,
    "reason" TEXT,
    "saveShownAt" TIMESTAMP(3),
    "confirmedAt" TIMESTAMP(3),
    "submittedAt" TIMESTAMP(3),
    "samcartConfirmedAt" TIMESTAMP(3),
    "error" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CancellationRequest_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "CancellationRequest_userId_createdAt_idx" ON "CancellationRequest"("userId", "createdAt");

ALTER TABLE "CancellationRequest" ADD CONSTRAINT "CancellationRequest_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "CancellationRequest" ADD CONSTRAINT "CancellationRequest_subscriptionId_fkey" FOREIGN KEY ("subscriptionId") REFERENCES "Subscription"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

CREATE TABLE "ReconciliationRun" (
    "id" TEXT NOT NULL,
    "startedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "finishedAt" TIMESTAMP(3),
    "status" TEXT NOT NULL,
    "summary" JSONB,
    "emailSentAt" TIMESTAMP(3),

    CONSTRAINT "ReconciliationRun_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "ReconciliationFinding" (
    "id" TEXT NOT NULL,
    "runId" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "severity" TEXT NOT NULL,
    "userId" TEXT,
    "subscriptionId" TEXT,
    "detail" JSONB NOT NULL,
    "autoFixed" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ReconciliationFinding_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "ReconciliationFinding_runId_kind_idx" ON "ReconciliationFinding"("runId", "kind");

ALTER TABLE "ReconciliationFinding" ADD CONSTRAINT "ReconciliationFinding_runId_fkey" FOREIGN KEY ("runId") REFERENCES "ReconciliationRun"("id") ON DELETE CASCADE ON UPDATE CASCADE;
