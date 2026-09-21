-- Optional poster/thumbnail for video attachments (composer + class teasers).
ALTER TABLE "PostAttachment" ADD COLUMN IF NOT EXISTS "thumbnailUrl" TEXT;
