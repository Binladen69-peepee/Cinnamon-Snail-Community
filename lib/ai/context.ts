import "server-only";
import { prisma } from "@/lib/db";
import type { PromptType } from "@/lib/ai/types";

/**
 * What the cohost is told before it writes anything — BUILD.md §16
 * "Generation": the voice profile, recent engagement, community themes,
 * unanswered questions, events, courses, the season, the target space and the
 * prompt configuration.
 *
 * All of it is real data read from this database. The point of gathering it is
 * that a prompt which knows what the room has been talking about, and what
 * nobody answered last week, is worth reading; one generated from nothing is
 * the "engagement question" everybody scrolls past.
 *
 * Everything is capped and trimmed — this becomes a model prompt, and an
 * unbounded read of a popular space would be both expensive and worse.
 */

export type VoiceProfile = {
  voice: string;
  bannedTerms: string[];
  themes: string[];
};

export const DEFAULT_VOICE: VoiceProfile = {
  voice: [
    "Adam Sobel, chef and founder of the Cinnamon Snail and Vegan University.",
    "Warm, funny, direct. Writes like he talks — short sentences, no corporate filler,",
    "no exclamation-mark enthusiasm. Treats cooking as a craft anyone can learn and",
    "never as a moral test. Specific over general: a real pan, a real mistake, a real",
    "Tuesday night. Never makes health claims and never praises animal products.",
  ].join(" "),
  bannedTerms: ["guys", "foodie", "clean eating", "guilt-free", "cheat meal", "plant-based protein hack"],
  themes: [],
};

export type GenerationContext = {
  space: { id: string; name: string; description: string | null } | null;
  voice: VoiceProfile;
  season: string;
  /** What the room has been posting about. */
  themes: string[];
  /** Posts nobody replied to — the best raw material for a prompt. */
  unanswered: string[];
  upcomingEvents: string[];
  recentLessons: string[];
  /** Recent engagement, so the model knows what landed. */
  engagement: { posts: number; comments: number; bestPost: string | null };
  /** Recent prompts, for the similarity guardrail and to avoid repeats. */
  recentPrompts: string[];
};

export function seasonOf(date: Date): string {
  const month = date.getUTCMonth();
  if (month <= 1 || month === 11) return "winter";
  if (month <= 4) return "spring";
  if (month <= 7) return "summer";
  return "autumn";
}

export async function loadVoiceProfile(): Promise<VoiceProfile> {
  const row = await prisma.aiVoiceProfile.findUnique({ where: { id: "singleton" } }).catch(() => null);
  if (!row) return DEFAULT_VOICE;
  return {
    voice: row.voice || DEFAULT_VOICE.voice,
    bannedTerms: row.bannedTerms.length ? row.bannedTerms : DEFAULT_VOICE.bannedTerms,
    themes: row.themes,
  };
}

const RECENT_DAYS = 21;
const CAP = 8;

export async function gatherContext(input: {
  spaceId: string | null;
  now?: Date;
}): Promise<GenerationContext> {
  const now = input.now ?? new Date();
  const since = new Date(now.getTime() - RECENT_DAYS * 86_400_000);
  const spaceFilter = input.spaceId ? { spaceId: input.spaceId } : {};

  const [space, voice, recentPosts, unanswered, events, lessons, comments, prompts] = await Promise.all([
    input.spaceId
      ? prisma.space.findUnique({
          where: { id: input.spaceId },
          select: { id: true, name: true, description: true },
        })
      : Promise.resolve(null),
    loadVoiceProfile(),
    prisma.post.findMany({
      where: { ...spaceFilter, status: "PUBLISHED", createdAt: { gte: since } },
      orderBy: { commentCount: "desc" },
      take: CAP,
      select: { title: true, plainText: true, commentCount: true },
    }),
    prisma.post.findMany({
      where: { ...spaceFilter, status: "PUBLISHED", createdAt: { gte: since }, commentCount: 0 },
      orderBy: { createdAt: "desc" },
      take: CAP,
      select: { title: true, plainText: true },
    }),
    prisma.event.findMany({
      where: { status: "PUBLISHED", startsAt: { gte: now } },
      orderBy: { startsAt: "asc" },
      take: 4,
      select: { title: true, startsAt: true },
    }),
    prisma.lesson.findMany({
      orderBy: { createdAt: "desc" },
      take: 5,
      select: { title: true },
    }),
    prisma.comment.count({ where: { createdAt: { gte: since } } }),
    prisma.aiPromptDraft.findMany({
      orderBy: { createdAt: "desc" },
      take: 25,
      select: { body: true, editedBody: true },
    }),
  ]);

  const summarise = (value: { title: string | null; plainText?: string }) =>
    (value.title || value.plainText || "").replace(/\s+/g, " ").trim().slice(0, 140);

  return {
    space,
    voice,
    season: seasonOf(now),
    themes: [...new Set([...voice.themes, ...recentPosts.map(summarise)])].filter(Boolean).slice(0, CAP),
    unanswered: unanswered.map(summarise).filter(Boolean),
    upcomingEvents: events.map(
      (event) => `${event.title} on ${event.startsAt.toISOString().slice(0, 10)}`,
    ),
    recentLessons: lessons.map((lesson) => lesson.title),
    engagement: {
      posts: recentPosts.length,
      comments,
      bestPost: recentPosts[0] ? summarise(recentPosts[0]) : null,
    },
    recentPrompts: prompts.map((draft) => draft.editedBody ?? draft.body),
  };
}

/** The context as the model reads it. Kept short — this is sent every call. */
export function contextBrief(context: GenerationContext, promptType: PromptType): string {
  const lines: string[] = [];
  lines.push(`Season: ${context.season}.`);
  if (context.space) {
    lines.push(`Space: ${context.space.name}${context.space.description ? ` — ${context.space.description}` : ""}.`);
  }
  if (context.themes.length) lines.push(`Recently posted about:\n- ${context.themes.join("\n- ")}`);
  if (context.unanswered.length) {
    lines.push(`Posted recently and nobody replied:\n- ${context.unanswered.join("\n- ")}`);
  }
  if (context.upcomingEvents.length) lines.push(`Coming up:\n- ${context.upcomingEvents.join("\n- ")}`);
  if (context.recentLessons.length) lines.push(`Recent lessons:\n- ${context.recentLessons.join("\n- ")}`);
  if (context.engagement.bestPost) {
    lines.push(`The post that got the most replies: ${context.engagement.bestPost}`);
  }
  if (context.recentPrompts.length) {
    lines.push(
      `Prompts already used — do not repeat these or rephrase them:\n- ${context.recentPrompts
        .slice(0, 12)
        .map((prompt) => prompt.replace(/\s+/g, " ").slice(0, 120))
        .join("\n- ")}`,
    );
  }
  lines.push(`Write one "${promptType.replace(/_/g, " ")}" prompt.`);
  return lines.join("\n\n");
}
