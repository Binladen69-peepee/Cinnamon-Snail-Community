import { CheckCircle2, KeyRound, PlugZap, ShieldAlert } from "lucide-react";
import { PageHeader, Card, CardHeader, Callout } from "@/components/app/ui";
import { BunnyLibrary } from "@/components/admin/bunny-library";
import { bunnyConfig, listBunnyVideos, unsignedEmbedsAllowed } from "@/lib/bunny/stream";
import { refreshPendingLessonVideos } from "@/lib/bunny/lessons";
import { prisma } from "@/lib/db";

export const metadata = { title: "Video library" };
export const dynamic = "force-dynamic";

/**
 * Lesson videos on Bunny Stream (DEC-081): whether Bunny is connected, whether
 * playback is signed, how many lessons are on Bunny, and the library itself.
 * The admin layout already restricts this to staff.
 */
export default async function AdminVideosPage() {
  const config = bunnyConfig();
  const connection = config ? await listBunnyVideos({ perPage: 1 }) : null;
  // Cheap and bounded: brings "processing" badges up to date for lessons.
  if (connection?.ok) await refreshPendingLessonVideos(10).catch(() => 0);
  const [onBunny, videoLessons] = await Promise.all([
    prisma.lesson.count({ where: { bunnyVideoId: { not: null } } }),
    prisma.lesson.count({ where: { kind: "VIDEO" } }),
  ]);
  const signed = Boolean(config?.tokenKey);
  const unsignedForTesting = !signed && unsignedEmbedsAllowed();

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title="Video library"
        description="Lesson videos on Bunny Stream. Members only ever get a player link signed for them, after the same checks as the lesson page."
      />

      <Card padding="none">
        <CardHeader title="Connection" icon={<PlugZap />} />
        <dl className="grid grid-cols-1 divide-y divide-separator text-label sm:grid-cols-3 sm:divide-x sm:divide-y-0">
          <div className="p-4 sm:p-5">
            <dt className="text-caption text-foreground-muted">Bunny API</dt>
            <dd className="mt-1 font-semibold text-foreground">
              {!config
                ? "Not configured"
                : connection?.ok
                  ? `Connected · ${connection.value.total} video${connection.value.total === 1 ? "" : "s"}`
                  : connection?.error ?? "Not reachable"}
            </dd>
          </div>
          <div className="p-4 sm:p-5">
            <dt className="text-caption text-foreground-muted">Playback links</dt>
            <dd className="mt-1 font-semibold text-foreground">
              {signed ? "Signed, expire after 4 hours" : unsignedForTesting ? "Unsigned (local testing only)" : "Off until signing is set up"}
            </dd>
          </div>
          <div className="p-4 sm:p-5">
            <dt className="text-caption text-foreground-muted">Video lessons on Bunny</dt>
            <dd className="mt-1 font-semibold tabular-nums text-foreground">
              {onBunny} of {videoLessons}
            </dd>
          </div>
        </dl>
      </Card>

      {config && !signed ? (
        <Callout tone="warning" icon={<KeyRound />} title="Turn on signed playback before members watch">
          In Bunny, open this library&apos;s Security settings, switch on Embed view token
          authentication, and copy the token authentication key into BUNNY_STREAM_TOKEN_KEY. Until
          then members are not given Bunny links at all{unsignedForTesting ? " (outside this local test flag)" : ""}.
        </Callout>
      ) : null}
      {config && signed ? (
        <Callout tone="success" icon={<CheckCircle2 />} title="Playback is signed">
          Every link is minted per member and expires. Also in Bunny: block direct file access, turn
          off the MP4 fallback, and list your domains as allowed referrers.
        </Callout>
      ) : null}
      {!config ? (
        <Callout tone="danger" icon={<ShieldAlert />} title="Bunny Stream is not configured">
          Set BUNNY_STREAM_LIBRARY_ID and BUNNY_STREAM_API_KEY on the server.
        </Callout>
      ) : (
        <BunnyLibrary />
      )}
    </div>
  );
}
