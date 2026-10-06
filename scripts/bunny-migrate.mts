/**
 * Moving existing lesson videos to Bunny Stream (DEC-081), in deliberate steps.
 *
 *   npx tsx --conditions=react-server scripts/bunny-migrate.mts            # dry run: the plan, changes nothing
 *   npx tsx --conditions=react-server scripts/bunny-migrate.mts --upload --limit=5
 *   npx tsx --conditions=react-server scripts/bunny-migrate.mts --attach
 *
 * `--upload` creates a Bunny video per lesson and streams the current file into
 * it (server to Bunny; nothing passes through a browser), recording each
 * lesson → video pair in scripts/.bunny-migration.json. It never touches a
 * lesson. `--attach` then sets `bunnyVideoId` only on lessons whose Bunny
 * video has finished encoding, so members never meet a half-processed class.
 * Re-running either step skips what is already done.
 *
 * Sources it can move: an absolute http(s) URL, and a file in our own storage
 * bucket. A Cloudflare Stream uid cannot be read without enabling downloads on
 * that video in Cloudflare first, so those are listed as "needs export".
 * PDFs and other downloads are not touched: they stay on Google Drive.
 *
 * Point DATABASE_URL and DIRECT_URL at the database you mean to change.
 */
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { PrismaClient } from "@prisma/client";
import { bunnyConfig, createBunnyVideo, getBunnyVideo } from "../lib/bunny/stream";
import { signedReadUrl } from "../lib/uploads/storage";

const prisma = new PrismaClient();
const args = new Set(process.argv.slice(2));
const limitArg = process.argv.find((arg) => arg.startsWith("--limit="));
const limit = limitArg ? Math.max(1, Number(limitArg.split("=")[1]) || 1) : 5;
const LEDGER = "scripts/.bunny-migration.json";

type Ledger = Record<string, { videoId: string; uploadedAt: string; title: string }>;
const ledger: Ledger = existsSync(LEDGER) ? JSON.parse(readFileSync(LEDGER, "utf8")) : {};
const saveLedger = () => writeFileSync(LEDGER, JSON.stringify(ledger, null, 2));

function sourceKind(uid: string): "url" | "bucket" | "cloudflare" {
  if (/^https?:\/\//i.test(uid)) return "url";
  if (uid.includes("/")) return "bucket";
  return "cloudflare";
}

async function readableUrl(uid: string): Promise<string | null> {
  const kind = sourceKind(uid);
  if (kind === "url") return uid;
  if (kind === "bucket") return (await signedReadUrl(uid).catch(() => null)) ?? null;
  return null;
}

async function upload(lesson: { id: string; title: string; videoUid: string }) {
  const config = bunnyConfig();
  if (!config) throw new Error("Bunny is not configured");
  const from = await readableUrl(lesson.videoUid);
  if (!from) return "needs export";
  const source = await fetch(from);
  if (!source.ok || !source.body) return `source unreachable (${source.status})`;
  const created = await createBunnyVideo(lesson.title);
  if (!created.ok) return `create failed: ${created.error}`;
  const put = await fetch(
    `https://video.bunnycdn.com/library/${config.libraryId}/videos/${created.value.guid}`,
    // Streams the body through without holding the whole file in memory.
    { method: "PUT", headers: { AccessKey: config.apiKey }, body: source.body, duplex: "half" } as RequestInit,
  );
  if (!put.ok) return `upload failed (${put.status})`;
  ledger[lesson.id] = { videoId: created.value.guid, uploadedAt: new Date().toISOString(), title: lesson.title };
  saveLedger();
  return `uploaded → ${created.value.guid}`;
}

const lessons = await prisma.lesson.findMany({
  where: { kind: "VIDEO", bunnyVideoId: null, videoUid: { not: null } },
  select: { id: true, title: true, videoUid: true },
  orderBy: { createdAt: "asc" },
});

if (args.has("--attach")) {
  let attached = 0;
  for (const [lessonId, entry] of Object.entries(ledger)) {
    const video = await getBunnyVideo(entry.videoId);
    if (!video.ok || video.value.state !== "ready") {
      console.log(`wait   ${entry.title}: ${video.ok ? video.value.state : video.error}`);
      continue;
    }
    const updated = await prisma.lesson.updateMany({
      where: { id: lessonId, bunnyVideoId: null },
      data: {
        bunnyVideoId: video.value.guid.toLowerCase(),
        bunnyVideoStatus: video.value.status,
        bunnyVideoLength: video.value.length || null,
        bunnySyncedAt: new Date(),
      },
    });
    if (updated.count > 0) {
      attached += 1;
      console.log(`attach ${entry.title} → ${video.value.guid}`);
    }
  }
  console.log(`${attached} lesson(s) attached.`);
} else if (args.has("--upload")) {
  let done = 0;
  for (const lesson of lessons) {
    if (done >= limit) break;
    if (ledger[lesson.id] || !lesson.videoUid) continue;
    console.log(`${lesson.title}: ${await upload({ ...lesson, videoUid: lesson.videoUid })}`);
    done += 1;
  }
  console.log(`Processed ${done}. Run with --attach once Bunny has encoded them.`);
} else {
  const counts = { url: 0, bucket: 0, cloudflare: 0 };
  for (const lesson of lessons) counts[sourceKind(lesson.videoUid!)] += 1;
  console.log(`Dry run: ${lessons.length} video lesson(s) not on Bunny yet.`);
  console.log(`  links: ${counts.url}, own storage: ${counts.bucket}, Cloudflare Stream (needs export): ${counts.cloudflare}`);
  console.log(`  already uploaded, waiting to attach: ${Object.keys(ledger).length}`);
  console.log("Nothing was changed. Use --upload --limit=N, then --attach.");
}
await prisma.$disconnect();
