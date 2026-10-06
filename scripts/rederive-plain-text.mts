/**
 * Re-derives the stored copies of member-written text — `bodyHtml` and
 * `plainText` on posts and comments, their search-index rows, and GIF
 * attachment types — from each row's own `body`, through the current
 * pipeline (lib/content/rich-text.ts, DEC-078). The member's words are never
 * changed. See lib/content/rederive.ts for exactly what is touched.
 *
 * Rows written before the pipeline kept markdown in `plainText`, which is how
 * `**bold**` showed up in excerpts, notifications and search; and kept
 * member-typed HTML in `bodyHtml`. New writes are already correct.
 *
 * A dry run unless --apply. Idempotent: a second --apply writes nothing.
 *
 *   DATABASE_URL=<local url> npx tsx scripts/rederive-plain-text.mts
 *   DATABASE_URL=<local url> npx tsx scripts/rederive-plain-text.mts --apply
 *
 * Any database that is not on this machine is refused unless --allow-remote
 * is passed too, so production can only ever be touched on purpose:
 *
 *   DATABASE_URL=<prod url> npx tsx scripts/rederive-plain-text.mts --allow-remote
 *   DATABASE_URL=<prod url> npx tsx scripts/rederive-plain-text.mts --allow-remote --apply
 *
 * Options:
 *   --apply          Write the changes (default: count them only).
 *   --allow-remote   Permit a database that is not localhost.
 *   --batch <n>      Rows per query (default 200).
 *   --post <id>      Only this post and its comments (repeatable).
 */

// The connection string is read before Prisma is loaded. Prisma's client reads
// a .env file when it is constructed, and this repository's .env names more
// than one database; the one used must be the one the operator chose.
const databaseUrl = process.env.DATABASE_URL ?? "";

type Args = {
  apply: boolean;
  allowRemote: boolean;
  batch: number;
  posts: string[];
};

function parseArgs(argv: string[]): Args {
  const args: Args = { apply: false, allowRemote: false, batch: 200, posts: [] };
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === "--apply") args.apply = true;
    else if (arg === "--allow-remote") args.allowRemote = true;
    else if (arg === "--batch") args.batch = Number(argv[(i += 1)]) || 200;
    else if (arg === "--post") {
      const id = argv[(i += 1)];
      if (id) args.posts.push(id);
    } else {
      throw new Error(`Unknown option: ${arg}`);
    }
  }
  return args;
}

/** Host and database name only: never the credentials. */
function describe(url: string): { host: string; database: string; local: boolean } {
  const parsed = new URL(url);
  const host = parsed.hostname.replace(/^\[|\]$/g, "");
  return {
    host,
    database: parsed.pathname.replace(/^\//, "") || "(default)",
    local: host === "localhost" || host === "127.0.0.1" || host === "::1",
  };
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  if (!databaseUrl) {
    console.error("Set DATABASE_URL to the database to fix. Nothing was read.");
    process.exit(1);
  }
  let target: ReturnType<typeof describe>;
  try {
    target = describe(databaseUrl);
  } catch {
    console.error("DATABASE_URL is not a URL. Nothing was read.");
    process.exit(1);
  }
  if (!target.local && !args.allowRemote) {
    console.error(
      `Refusing ${target.host}: it is not this machine. Pass --allow-remote to run against it on purpose.`,
    );
    process.exit(1);
  }

  console.log(
    `${args.apply ? "Applying" : "Dry run"} on ${target.host}/${target.database}` +
      (args.posts.length ? ` (posts: ${args.posts.join(", ")})` : ""),
  );

  const { PrismaClient } = await import("@prisma/client");
  const { rederiveRichText } = await import("../lib/content/rederive");
  const prisma = new PrismaClient({ datasources: { db: { url: databaseUrl } } });
  try {
    const report = await rederiveRichText(prisma, {
      apply: args.apply,
      batchSize: args.batch,
      postIds: args.posts.length ? args.posts : undefined,
      log: (line) => console.log(`  ${line}`),
    });
    console.log(JSON.stringify(report, null, 2));
    if (!args.apply) console.log("Dry run: nothing was written. Re-run with --apply to write.");
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
