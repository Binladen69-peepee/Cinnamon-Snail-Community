ALTER TABLE "VerificationToken" ADD COLUMN "usedAt" TIMESTAMP(3);
ALTER TABLE "VerificationToken" ADD COLUMN "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;

CREATE INDEX "VerificationToken_identifier_expires_idx" ON "VerificationToken"("identifier", "expires");
