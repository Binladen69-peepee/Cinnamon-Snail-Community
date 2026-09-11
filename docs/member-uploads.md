# Member uploads

Photos and video that members attach to posts, stored in Supabase Storage.

The app is written so uploads are **off until configured**: `uploadsConfigured()`
checks for the two variables below, and the composer's Photo button is disabled
with an explanation rather than failing after someone has picked a file. Nothing
else in the product changes if this is never set up.

## Environment

| Variable | Where | Purpose |
| --- | --- | --- |
| `SUPABASE_URL` | Project settings → API → Project URL | Base URL for storage |
| `SUPABASE_SERVICE_ROLE_KEY` | Project settings → API → service_role | Mints one-object upload URLs. **Server only.** |
| `SUPABASE_UPLOAD_BUCKET` | optional | Defaults to `community-uploads` |

The service role key must be marked **Sensitive** in Vercel. It is only ever
read inside `lib/uploads/storage.ts`, which carries `import "server-only"` so a
client component importing it fails the build rather than shipping the key.

## Agreed policy

Enforced in `lib/uploads/policy.ts`, and covered by `tests/uploads.test.ts`:

- **Images** — `jpg`, `png`, `webp`, `gif`, up to **10 MB**
- **Video** — `mp4`, `mov`, up to **100 MB**
- **Keys** — `community-uploads/{user_id}/{time}-{random}.{ext}`

Three notes on how that is applied:

**The user id comes from the session, never from the request.** The client says
what a file *is*; the server decides where it goes. A member cannot write under
another member's prefix regardless of what they send.

**SVG is deliberately excluded.** It is an image to a browser and a script host
to an attacker, so it is absent from the allowlist even though it is an image
format.

**The declared size is re-checked after the upload.** Nothing stops a client
asking for a URL for a 1 KB image and then PUTting 80 MB, so
`verifyUploaded()` reads the stored object's own metadata before any attachment
row is written, and deletes anything that turns out to be outside policy.

## Bucket setup

Create a bucket named `community-uploads`, **public read**.

Public read is a deliberate trade: signing every image in a scrolling feed
would cost a round trip per picture. What protects a member's uploads from being
enumerated is the random segment in the object key — `{user_id}/` alone would be
guessable from any user id.

Then apply these policies. Writes are restricted to a member's own prefix, which
is what makes the key layout load-bearing rather than cosmetic:

```sql
-- Anyone may read. The bucket is public; this makes it explicit.
create policy "community-uploads: public read"
on storage.objects for select
using (bucket_id = 'community-uploads');

-- A member may only write under their own id.
create policy "community-uploads: owner write"
on storage.objects for insert
to authenticated
with check (
  bucket_id = 'community-uploads'
  and (storage.foldername(name))[1] = auth.uid()::text
);

-- And may only replace or delete their own objects.
create policy "community-uploads: owner update"
on storage.objects for update
to authenticated
using (
  bucket_id = 'community-uploads'
  and (storage.foldername(name))[1] = auth.uid()::text
);

create policy "community-uploads: owner delete"
on storage.objects for delete
to authenticated
using (
  bucket_id = 'community-uploads'
  and (storage.foldername(name))[1] = auth.uid()::text
);
```

Set the per-bucket file size limit to **100 MB** and the allowed MIME types to
`image/jpeg,image/png,image/webp,image/gif,video/mp4,video/quicktime`, so the
bucket enforces the same policy the application does. Two layers, same rules.

### One thing worth knowing

These RLS policies are written against `auth.uid()`, which is Supabase Auth's
notion of the current user. This app authenticates with Auth.js, so members have
no Supabase JWT — uploads are authorised by **our** session and then performed
with a signed URL minted by the service role, which bypasses RLS by design.

That means the policies above are defence in depth, not the primary control.
The primary control is `createSignedUpload()`, which builds the key from the
session's user id. The policies matter if a Supabase-authenticated path is ever
added, and they cost nothing to have in place now.

## Client behaviour

- The preview is a local `createObjectURL`, so the photo appears with no network
  at all.
- Images are downscaled to a 2000px longest edge and re-encoded as WebP before
  upload. A 6 MB phone photo becomes a few hundred KB — roughly twenty times
  less to upload, and twenty times cheaper for everyone who scrolls past it
  later.
- GIFs are **not** re-encoded; drawing one to a canvas keeps the first frame and
  throws away the animation.
- Progress is real, via `XMLHttpRequest` — `fetch` still cannot report upload
  progress.
- Failures are per file. One photo failing out of four leaves the draft and the
  other three alone and offers a retry on that one.
- `width` and `height` are captured and stored, so the feed reserves exact space
  before an image loads and never jumps.

## Verifying it works

1. Set the two variables and restart.
2. Open `/home`; the composer's Photo button should be enabled.
3. Attach an image over 10 MB — it should be refused before any upload starts.
4. Attach a valid image; the tile should preview instantly, then show progress,
   then a tick.
5. Post, and confirm the image renders in the feed at the right aspect ratio
   with no layout shift on reload.
