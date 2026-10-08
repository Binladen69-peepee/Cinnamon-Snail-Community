/**
 * Moves the class recordings from Google Drive to Bunny Stream, Drive to Bunny
 * directly: Bunny's fetch API downloads each file from the Drive API itself,
 * so nothing passes through this machine.
 *
 *   node --env-file=.env scripts/drive-to-bunny.mjs                 # plan: what would move, changes nothing
 *   node --env-file=.env scripts/drive-to-bunny.mjs fetch --batch=3 # ask Bunny to fetch the next 3 files
 *   node --env-file=.env scripts/drive-to-bunny.mjs status          # read Bunny's progress into the ledger
 *   node --env-file=.env scripts/drive-to-bunny.mjs verify          # check every finished video against Drive
 *
 * Which file each class gets comes from docs/migration/class-video-mapping.mjs.
 * Classes marked Medium or High there move only once their file(s) are listed
 * in docs/migration/approved-selections.json ({ "<class>": ["<drive id>", ...] }).
 * Every request and result is kept in docs/migration/bunny-ledger.json, keyed by
 * Drive file id: class → Drive file → Bunny video. A file already in the ledger,
 * or already in the library under the same title, is never fetched twice.
 *
 * Reads Google Drive only (file metadata and content); never writes to it.
 * Google access comes from an rclone remote authorised once in the browser with
 * scope drive.readonly (`rclone config create vu-drive drive scope=drive.readonly`;
 * RCLONE_DRIVE_REMOTE and RCLONE_PATH override the name and binary): each batch
 * hands Bunny an access token from it with at least 45 minutes left. Bunny:
 * BUNNY_STREAM_LIBRARY_ID + BUNNY_STREAM_API_KEY. No key or token is ever
 * printed. Lessons are not touched here; scripts/bunny-lessons-migration.mjs
 * writes them as a migration.
 */
import https from "node:https";
import { execFileSync } from "node:child_process";
import { Resolver } from "node:dns/promises";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { MAP } from "../docs/migration/class-video-mapping.mjs";

const LEDGER = "docs/migration/bunny-ledger.json";
const APPROVALS = "docs/migration/approved-selections.json";
/** The first batch: three short, unambiguous classes, one edited Final and two .mov recordings. */
const FIRST_BATCH = ["1LwxxTNm4csTkUwmG4YcvxSSGgIq-sbus", "1sDdmnw4ctGwtlHV5oZ-M3gTOEzhBKNwt", "1wpsTtv4bTZudrQeb4sS4_GB6vYL4KOVW"];
/** Bunny length and Drive duration may differ by this much (seconds). */
const LENGTH_TOLERANCE = 3;

const [command = "plan", ...rest] = process.argv.slice(2);
const flag = (name) => rest.find((arg) => arg.startsWith(`--${name}=`))?.split("=")[1];
const batchSize = Math.max(1, Number(flag("batch")) || 3);

const ledger = existsSync(LEDGER) ? JSON.parse(readFileSync(LEDGER, "utf8")) : {};
const saveLedger = () => writeFileSync(LEDGER, JSON.stringify(ledger, null, 2) + "\n");
const approvals = existsSync(APPROVALS) ? JSON.parse(readFileSync(APPROVALS, "utf8")) : {};

/* -------------------------------------------------------------------------- */
/* What moves                                                                  */
/* -------------------------------------------------------------------------- */

/** One row per Drive file to move, in migration order, plus the classes still waiting on a decision. */
function plan() {
  const files = [];
  const waiting = [];
  MAP.forEach(([title, rec, others, risk], index) => {
    const known = new Map([rec, ...others].map((file) => [file.id, file]));
    let ids = [rec.id];
    if (risk === "Medium" || risk === "High") {
      if (!approvals[title]) return waiting.push({ n: index + 1, title, risk });
      ids = approvals[title];
    }
    ids.forEach((id, part) => {
      const file = known.get(id);
      if (!file) throw new Error(`${title}: approved file ${id} is not one of its Drive files`);
      const bunnyTitle = ids.length > 1 ? `${title} (${part + 1} of ${ids.length})` : title;
      files.push({ n: index + 1, title, bunnyTitle, part: part + 1, parts: ids.length, risk, ...file });
    });
  });
  const first = (file) => (FIRST_BATCH.includes(file.id) ? 0 : 1);
  files.sort((a, b) => first(a) - first(b) || a.n - b.n || a.part - b.part);
  return { files, waiting };
}

/* -------------------------------------------------------------------------- */
/* Network                                                                     */
/* -------------------------------------------------------------------------- */

// The office router cannot resolve *.mediadelivery.net (video.bunnycdn.com is a
// CNAME into it), so names are looked up on public resolvers instead.
const resolver = new Resolver();
resolver.setServers(["1.1.1.1", "8.8.8.8"]);
function lookup(hostname, options, callback) {
  resolver.resolve4(hostname).then(
    (addresses) => (options?.all ? callback(null, addresses.map((address) => ({ address, family: 4 }))) : callback(null, addresses[0], 4)),
    (error) => callback(error),
  );
}

function request(url, { method = "GET", headers = {}, body } = {}) {
  const target = new URL(url);
  const payload = body === undefined ? undefined : typeof body === "string" ? body : JSON.stringify(body);
  return new Promise((resolve, reject) => {
    const req = https.request(
      {
        host: target.hostname,
        path: target.pathname + target.search,
        method,
        lookup,
        timeout: 60_000,
        headers: { accept: "application/json", ...headers, ...(payload ? { "content-length": Buffer.byteLength(payload) } : {}) },
      },
      (res) => {
        let text = "";
        res.setEncoding("utf8");
        res.on("data", (chunk) => (text += chunk));
        res.on("end", () => {
          let json = null;
          try { json = text ? JSON.parse(text) : null; } catch { json = null; }
          resolve({ status: res.statusCode ?? 0, json });
        });
      },
    );
    req.on("timeout", () => req.destroy(new Error(`timeout: ${target.hostname}`)));
    req.on("error", reject);
    if (payload) req.write(payload);
    req.end();
  });
}

const env = (name) => process.env[name]?.trim() || "";

function bunny(method, path, body) {
  const library = env("BUNNY_STREAM_LIBRARY_ID");
  const key = env("BUNNY_STREAM_API_KEY");
  if (!library || !key) throw new Error("BUNNY_STREAM_LIBRARY_ID / BUNNY_STREAM_API_KEY are not set");
  return request(`https://video.bunnycdn.com/library/${encodeURIComponent(library)}${path}`, {
    method,
    headers: { AccessKey: key, ...(body ? { "content-type": "application/json" } : {}) },
    body,
  });
}

/** The rclone Drive remote, authorised once in the browser with scope drive.readonly. */
const RCLONE = env("RCLONE_PATH") || "rclone";
const REMOTE = env("RCLONE_DRIVE_REMOTE") || "vu-drive";
/** The only Drive these recordings live in. A token for any other account is refused. */
const DRIVE_OWNER = "adam@cinnamonsnail.com";
/** A token handed to Bunny must outlive the queue in front of its fetch. */
const TOKEN_MIN_LIFE = 45 * 60_000;

function rcloneToken() {
  const path = execFileSync(RCLONE, ["config", "file"], { encoding: "utf8" }).trim().split(/\r?\n/).pop().trim();
  const text = readFileSync(path, "utf8");
  const section = text.split(/^\[/m).find((part) => part.startsWith(`${REMOTE}]`));
  const line = section?.split(/\r?\n/).find((row) => /^token\s*=/.test(row));
  if (!line) throw new Error(`rclone remote "${REMOTE}" has no Drive token yet; authorise it first`);
  if (!/^scope\s*=\s*drive\.readonly\s*$/m.test(section)) throw new Error(`rclone remote "${REMOTE}" is not read-only`);
  return { path, text, line, token: JSON.parse(line.replace(/^token\s*=\s*/, "")) };
}

let googleToken = null;
/**
 * A drive.readonly access token from the rclone remote. rclone only renews a
 * token once it has expired, so when this one has under 45 minutes left it is
 * marked expired in rclone's own config and a read-only listing renews it.
 */
async function driveToken() {
  if (googleToken && googleToken.until > Date.now() + TOKEN_MIN_LIFE) return googleToken.value;
  let current = rcloneToken();
  if (new Date(current.token.expiry).getTime() - Date.now() < TOKEN_MIN_LIFE) {
    const expired = `token = ${JSON.stringify({ ...current.token, expiry: "2000-01-01T00:00:00Z" })}`;
    writeFileSync(current.path, current.text.replace(current.line, expired));
    execFileSync(RCLONE, ["lsf", `${REMOTE}:`, "--max-depth", "1", "--dirs-only"], { stdio: "ignore" });
    current = rcloneToken();
  }
  const until = new Date(current.token.expiry).getTime();
  if (until - Date.now() < TOKEN_MIN_LIFE) throw new Error("rclone did not renew the Drive token");
  const value = current.token.access_token;
  // Never hand Bunny (or read with) a token for someone else's Drive.
  const about = await request("https://www.googleapis.com/drive/v3/about?fields=user(emailAddress)", { headers: { Authorization: `Bearer ${value}` } });
  const account = about.json?.user?.emailAddress?.toLowerCase();
  if (account !== DRIVE_OWNER) throw new Error(`rclone remote "${REMOTE}" is signed in as ${account ?? "an unknown account"}, not ${DRIVE_OWNER}; nothing was done`);
  googleToken = { value, until };
  return googleToken.value;
}

/** Drive's own record of a file: name, size, checksum and (for video) duration. Read only. */
async function driveFile(id) {
  const fields = "id,name,size,md5Checksum,mimeType,trashed,videoMediaMetadata";
  const { status, json } = await request(
    `https://www.googleapis.com/drive/v3/files/${encodeURIComponent(id)}?fields=${fields}&supportsAllDrives=true`,
    { headers: { Authorization: `Bearer ${await driveToken()}` } },
  );
  if (status !== 200) throw new Error(`Drive metadata for ${id}: ${status} ${json?.error?.errors?.[0]?.reason ?? json?.error?.status ?? ""}`.trim());
  return json;
}

/** Library videos whose title is exactly this one. */
async function bunnyByTitle(title) {
  const { status, json } = await bunny("GET", `/videos?page=1&itemsPerPage=100&orderBy=date&search=${encodeURIComponent(title)}`);
  if (status !== 200) throw new Error(`Bunny search: ${status}`);
  return (json?.items ?? []).filter((video) => video.title === title);
}

const STATE = { 0: "created", 1: "uploaded", 2: "processing", 3: "transcoding", 4: "ready", 5: "failed", 6: "upload failed", 7: "jit segmenting", 8: "jit playlists" };
const snapshot = (video) => ({
  bunnyStatus: video.status,
  bunnyState: STATE[video.status] ?? `status ${video.status}`,
  encodeProgress: video.encodeProgress ?? null,
  lengthSeconds: video.length || null,
  width: video.width || null,
  height: video.height || null,
  resolutions: video.availableResolutions || null,
  storageBytes: video.storageSize || null,
  checkedAt: new Date().toISOString(),
});

/* -------------------------------------------------------------------------- */
/* Steps                                                                       */
/* -------------------------------------------------------------------------- */

async function fetchBatch() {
  const { files } = plan();
  const todo = files.filter((file) => !ledger[file.id]?.bunnyVideoId).slice(0, batchSize);
  if (todo.length === 0) return console.log("Nothing left to fetch.");
  for (const file of todo) {
    // Drive first: the file must still be there, untrashed, and the size we mapped.
    const meta = await driveFile(file.id);
    if (meta.trashed || Number(meta.size) !== file.bytes) {
      console.log(`skip   #${file.n} ${file.bunnyTitle}: Drive file changed (trashed ${meta.trashed}, size ${meta.size})`);
      continue;
    }
    const entry = (ledger[file.id] ??= {});
    Object.assign(entry, {
      class: file.title,
      classNumber: file.n,
      part: file.parts > 1 ? `${file.part} of ${file.parts}` : undefined,
      driveFileId: file.id,
      driveName: meta.name,
      driveBytes: Number(meta.size),
      driveMd5: meta.md5Checksum ?? null,
      driveDurationSeconds: meta.videoMediaMetadata?.durationMillis ? Math.round(Number(meta.videoMediaMetadata.durationMillis) / 1000) : null,
      driveVideo: meta.videoMediaMetadata ? `${meta.videoMediaMetadata.width}x${meta.videoMediaMetadata.height}` : null,
      bunnyTitle: file.bunnyTitle,
    });

    const existing = await bunnyByTitle(file.bunnyTitle);
    const usable = existing.find((video) => video.status !== 5 && video.status !== 6);
    if (usable) {
      Object.assign(entry, { bunnyVideoId: usable.guid, source: "already in Bunny", ...snapshot(usable) });
      saveLedger();
      console.log(`have   #${file.n} ${file.bunnyTitle} → ${usable.guid} (already in the library)`);
      continue;
    }

    const requestedAt = new Date();
    const url = `https://www.googleapis.com/drive/v3/files/${encodeURIComponent(file.id)}?alt=media&supportsAllDrives=true`;
    const { status, json } = await bunny("POST", "/videos/fetch", {
      url,
      title: file.bunnyTitle,
      headers: { Authorization: `Bearer ${await driveToken()}` },
    });
    if (status === 429) {
      saveLedger();
      console.log(`wait   Bunny has too many fetches queued (429). Run status, then fetch again.`);
      break;
    }
    if (status < 200 || status >= 300 || json?.success === false) {
      Object.assign(entry, { error: `fetch refused: ${status} ${json?.message ?? ""}`.trim(), errorAt: requestedAt.toISOString() });
      saveLedger();
      console.log(`fail   #${file.n} ${file.bunnyTitle}: ${entry.error}`);
      continue;
    }
    // Newer API versions answer with the new video's id; older ones only with
    // success, so find it by its (unique) title.
    let videoId = json?.id ?? json?.guid ?? null;
    for (let tries = 0; !videoId && tries < 10; tries += 1) {
      await new Promise((done) => setTimeout(done, 3000));
      videoId = (await bunnyByTitle(file.bunnyTitle)).find((video) => new Date(video.dateUploaded + "Z") >= new Date(requestedAt.getTime() - 60_000))?.guid ?? null;
    }
    Object.assign(entry, { bunnyVideoId: videoId, source: "fetched from Drive", fetchRequestedAt: requestedAt.toISOString(), error: videoId ? undefined : "fetch accepted but no video found yet; run status" });
    saveLedger();
    console.log(`fetch  #${file.n} ${file.bunnyTitle} (${(file.bytes / 1e9).toFixed(2)} GB) → ${videoId ?? "pending"}`);
  }
}

async function status() {
  const rows = Object.values(ledger);
  for (const entry of rows) {
    if (!entry.bunnyVideoId) {
      const found = (await bunnyByTitle(entry.bunnyTitle))[0];
      if (!found) { console.log(`none   #${entry.classNumber} ${entry.bunnyTitle}: no video in Bunny yet`); continue; }
      entry.bunnyVideoId = found.guid;
      delete entry.error;
    }
    const { status: code, json } = await bunny("GET", `/videos/${encodeURIComponent(entry.bunnyVideoId)}`);
    if (code !== 200) { console.log(`gone   #${entry.classNumber} ${entry.bunnyTitle}: Bunny ${code}`); continue; }
    Object.assign(entry, snapshot(json));
    const progress = entry.bunnyStatus === 4 ? "" : ` ${entry.encodeProgress ?? 0}%`;
    console.log(`${entry.bunnyState.padEnd(12)} #${entry.classNumber} ${entry.bunnyTitle}${progress} ${entry.lengthSeconds ? `${Math.round(entry.lengthSeconds / 60)} min` : ""}`);
  }
  saveLedger();
}

async function verify() {
  await status();
  let passed = 0;
  for (const entry of Object.values(ledger)) {
    if (entry.bunnyStatus !== 4) continue;
    const problems = [];
    if (!entry.lengthSeconds) problems.push("Bunny reports no length");
    if (entry.driveDurationSeconds && entry.lengthSeconds && Math.abs(entry.driveDurationSeconds - entry.lengthSeconds) > LENGTH_TOLERANCE) {
      problems.push(`length ${entry.lengthSeconds}s vs Drive ${entry.driveDurationSeconds}s`);
    }
    if (!entry.driveDurationSeconds && entry.lengthSeconds && entry.lengthSeconds < 15 * 60) problems.push(`only ${Math.round(entry.lengthSeconds / 60)} min long`);
    if (entry.height && entry.height < 720) problems.push(`${entry.width}x${entry.height}, below 720p`);
    if (!entry.resolutions) problems.push("no renditions listed");
    entry.verified = { ok: problems.length === 0, problems, at: new Date().toISOString() };
    if (entry.verified.ok) passed += 1;
    console.log(`${entry.verified.ok ? "ok    " : "CHECK "} #${entry.classNumber} ${entry.bunnyTitle} ${Math.round((entry.lengthSeconds ?? 0) / 60)} min ${entry.width}x${entry.height}${problems.length ? ` · ${problems.join("; ")}` : ""}`);
  }
  saveLedger();
  console.log(`${passed} verified of ${Object.keys(ledger).length} in the ledger.`);
}

function printPlan() {
  const { files, waiting } = plan();
  const done = files.filter((file) => ledger[file.id]?.bunnyVideoId);
  const todo = files.filter((file) => !ledger[file.id]?.bunnyVideoId);
  const gb = (list) => (list.reduce((sum, file) => sum + file.bytes, 0) / 1e9).toFixed(1);
  console.log(`Plan: ${files.length} file(s) for ${new Set(files.map((f) => f.title)).size} class(es), ${gb(files)} GB. In Bunny already: ${done.length}. To fetch: ${todo.length} (${gb(todo)} GB).`);
  todo.slice(0, batchSize).forEach((file) => console.log(`  next  #${file.n} ${file.bunnyTitle} ← ${file.name} (${file.version}, ${(file.bytes / 1e9).toFixed(2)} GB)`));
  if (waiting.length) {
    console.log(`Waiting on a decision (${waiting.length}), not moved until listed in ${APPROVALS}:`);
    waiting.forEach((row) => console.log(`  #${row.n} ${row.title} (${row.risk})`));
  }
  console.log("Nothing was changed.");
}

/** Whose Drive this is, that the token is read-only, and that every planned file is there unchanged. */
async function access() {
  const token = await driveToken();
  const info = await request(`https://oauth2.googleapis.com/tokeninfo?access_token=${encodeURIComponent(token)}`);
  const about = await request("https://www.googleapis.com/drive/v3/about?fields=user(emailAddress)", { headers: { Authorization: `Bearer ${token}` } });
  const scopes = String(info.json?.scope ?? "").split(" ");
  console.log(`Drive account: ${about.json?.user?.emailAddress ?? `unknown (${about.status})`}; scope: ${scopes.join(", ") || info.status}`);
  if (scopes.some((scope) => scope !== "https://www.googleapis.com/auth/drive.readonly")) throw new Error("The token is not drive.readonly only");
  const { files } = plan();
  let readable = 0;
  let withDuration = 0;
  for (const file of files) {
    const meta = await driveFile(file.id).catch((error) => ({ error: error.message }));
    if (!meta.error && !meta.trashed && Number(meta.size) === file.bytes) readable += 1;
    else console.log(`  problem #${file.n} ${file.bunnyTitle}: ${meta.error ?? `trashed ${meta.trashed}, size ${meta.size}`}`);
    if (meta.videoMediaMetadata?.durationMillis) withDuration += 1;
  }
  console.log(`${readable} of ${files.length} planned files readable at the mapped size; ${withDuration} carry a duration in Drive.`);
}

const steps = { plan: printPlan, access, fetch: fetchBatch, status, verify };
if (!steps[command]) throw new Error(`Unknown step "${command}". Use plan, access, fetch, status or verify.`);
await steps[command]();
