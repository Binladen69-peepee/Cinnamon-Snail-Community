import "server-only";
import Anthropic from "@anthropic-ai/sdk";
import { zodOutputFormat } from "@anthropic-ai/sdk/helpers/zod";
import { z } from "zod";
import { contextBrief, type GenerationContext } from "@/lib/ai/context";
import { PROMPT_TYPE_BRIEF, type PromptType } from "@/lib/ai/types";
import { MAX_PROMPT_CHARS } from "@/lib/ai/guardrails";

/**
 * Writing one community prompt, in Adam's voice.
 *
 * Claude is the assistant here, not the publisher: this returns a draft that
 * goes into a queue a human reads. Nothing it produces reaches members without
 * an explicit approval, which is BUILD.md §16's "There is NO auto-publish mode
 * in v1" and the reason the guardrails sit between this and the queue rather
 * than between the queue and publishing.
 *
 * Structured output rather than free text, so the type and the body come back
 * as fields instead of something to parse out of prose.
 *
 * Two providers, one contract: Groq (`GROQ_API_KEY`, an OpenAI-compatible API
 * whose models are held to the exact JSON schema) when its key is set,
 * otherwise Claude (`ANTHROPIC_API_KEY`). Either way the same schema checks the
 * answer and the same guardrails read it before a human does. With neither key
 * the whole thing is off — the schedule still runs, finds it cannot generate,
 * and says so.
 */

const PromptSchema = z.object({
  body: z
    .string()
    .describe(
      `The prompt itself, as Adam would post it. One question, under ${MAX_PROMPT_CHARS} characters.`,
    ),
  rationale: z
    .string()
    .describe("One short line on why this is worth asking the room now. Not shown to members."),
  pollOptions: z
    .array(z.string())
    .describe(
      "For a poll prompt only: two to four short options members pick between. An empty list for every other type.",
    ),
});

export type GeneratedPrompt = {
  body: string;
  rationale: string;
  /** Two to four options when the type is a poll; empty otherwise. */
  pollOptions: string[];
  model: string;
  inputTokens: number;
  outputTokens: number;
};

export type GenerateResult =
  | { ok: true; prompt: GeneratedPrompt }
  | { ok: false; error: string; retryable: boolean };

export type CohostProvider = "groq" | "anthropic";

/** Which model writes the drafts: Groq when its key is set, then Claude, else none. */
export function cohostProvider(): CohostProvider | null {
  if (process.env.GROQ_API_KEY?.trim()) return "groq";
  if (process.env.ANTHROPIC_API_KEY?.trim()) return "anthropic";
  return null;
}

export function cohostConfigured(): boolean {
  return cohostProvider() !== null;
}

const MODEL = process.env.ANTHROPIC_MODEL || "claude-opus-5-5";
const GROQ_MODEL = process.env.GROQ_MODEL || "openai/gpt-oss-120b";
const GROQ_URL = "https://api.groq.com/openai/v1/chat/completions";

/** The schema Groq is held to, from the same definition the answer is checked against. */
// eslint-disable-next-line @typescript-eslint/no-unused-vars
const { $schema: _dialect, ...PROMPT_JSON_SCHEMA } = z.toJSONSchema(PromptSchema) as Record<string, unknown>;

/** Trimmed and capped the same way, whichever model wrote it. */
function shapePrompt(
  parsed: z.infer<typeof PromptSchema>,
  usage: { model: string; inputTokens: number; outputTokens: number },
): GeneratedPrompt {
  return {
    body: parsed.body.trim(),
    rationale: parsed.rationale?.trim() ?? "",
    pollOptions: (parsed.pollOptions ?? [])
      .map((option) => option.trim())
      .filter(Boolean)
      .slice(0, 4),
    ...usage,
  };
}

type GroqReply = {
  model?: string;
  error?: { message?: string };
  choices?: { finish_reason?: string; message?: { content?: string | null } }[];
  usage?: { prompt_tokens?: number; completion_tokens?: number };
};

/**
 * One prompt from Groq. `strict` structured output, so the reply is the
 * schema's JSON or an error; it is still parsed against the zod schema.
 */
async function generateWithGroq(system: string, brief: string): Promise<GenerateResult> {
  let response: Response;
  try {
    response = await fetch(GROQ_URL, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${process.env.GROQ_API_KEY?.trim()}`,
        "content-type": "application/json",
      },
      body: JSON.stringify({
        model: GROQ_MODEL,
        // Room for the model's reasoning as well as one short prompt.
        max_completion_tokens: 2000,
        reasoning_effort: "medium",
        messages: [
          { role: "system", content: system },
          { role: "user", content: brief },
        ],
        response_format: {
          type: "json_schema",
          json_schema: { name: "community_prompt", strict: true, schema: PROMPT_JSON_SCHEMA },
        },
      }),
    });
  } catch {
    return { ok: false, error: "could not reach the Groq API", retryable: true };
  }

  const payload = (await response.json().catch(() => null)) as GroqReply | null;

  // Most specific first: a bad key will never succeed on retry, a rate limit
  // or a 5xx will. Never echo the request: it carries the key.
  if (!response.ok) {
    if (response.status === 401 || response.status === 403) {
      return { ok: false, error: "the Groq API key was rejected", retryable: false };
    }
    if (response.status === 429) {
      return { ok: false, error: "rate limited by the Groq API", retryable: true };
    }
    if (response.status >= 400 && response.status < 500) {
      const detail = payload?.error?.message ?? String(response.status);
      return { ok: false, error: `the request was refused: ${detail.slice(0, 200)}`, retryable: false };
    }
    return { ok: false, error: `Groq API error ${response.status}`, retryable: true };
  }

  const choice = payload?.choices?.[0];
  if (choice?.finish_reason === "content_filter") {
    return { ok: false, error: "the model declined", retryable: false };
  }
  let parsed: ReturnType<typeof PromptSchema.safeParse> | null = null;
  try {
    parsed = PromptSchema.safeParse(JSON.parse(choice?.message?.content ?? ""));
  } catch {
    parsed = null;
  }
  if (!parsed?.success || !parsed.data.body.trim()) {
    return { ok: false, error: "the model returned nothing usable", retryable: true };
  }
  return {
    ok: true,
    prompt: shapePrompt(parsed.data, {
      model: payload?.model ?? GROQ_MODEL,
      inputTokens: payload?.usage?.prompt_tokens ?? 0,
      outputTokens: payload?.usage?.completion_tokens ?? 0,
    }),
  };
}

function systemPrompt(context: GenerationContext): string {
  return [
    "You write one short discussion prompt for a vegan cooking community, in the founder's voice.",
    "",
    "Voice:",
    context.voice.voice,
    "",
    "Hard rules, because these get the prompt thrown away:",
    "- Exactly one question. Never stack two.",
    `- Under ${MAX_PROMPT_CHARS} characters, including the question.`,
    "- No health claims of any kind: nothing cures, heals, detoxes, boosts immunity or prevents disease.",
    "- Never speak approvingly of animal products, and never suggest cooking with one.",
    "- No hype, no exclamation marks, no 'drop a comment below'.",
    "- Ask something a person can answer from their own week in the kitchen.",
    context.voice.bannedTerms.length
      ? `- Never use these words or phrases: ${context.voice.bannedTerms.join(", ")}.`
      : "",
    "",
    "Write the prompt as a post, not as a request to the model. No preamble, no sign-off.",
  ]
    .filter(Boolean)
    .join("\n");
}

export async function generatePrompt(input: {
  context: GenerationContext;
  promptType: PromptType;
  /** Extra steer, e.g. a reviewer pressing Regenerate with a note. */
  note?: string;
}): Promise<GenerateResult> {
  const provider = cohostProvider();
  if (!provider) {
    return { ok: false, error: "no model key is configured (GROQ_API_KEY or ANTHROPIC_API_KEY)", retryable: false };
  }

  const brief = [
    contextBrief(input.context, input.promptType),
    "",
    PROMPT_TYPE_BRIEF[input.promptType],
    input.note ? `\nThe reviewer asked for another try: ${input.note}` : "",
  ]
    .filter(Boolean)
    .join("\n");

  if (provider === "groq") return generateWithGroq(systemPrompt(input.context), brief);

  const client = new Anthropic();
  try {
    const response = await client.messages.parse({
      model: MODEL,
      // A single short prompt; the cap is deliberately small rather than lowballed.
      max_tokens: 2000,
      // Thinking is always on for this model; medium is its default and enough
      // for a short piece of writing against a list of constraints.
      output_config: { effort: "medium", format: zodOutputFormat(PromptSchema) },
      system: systemPrompt(input.context),
      messages: [{ role: "user", content: brief }],
    });

    // A safety decline comes back as HTTP 200 with this stop reason.
    if (response.stop_reason === "refusal") {
      return {
        ok: false,
        error: `the model declined: ${response.stop_details?.category ?? "unspecified"}`,
        retryable: false,
      };
    }
    const parsed = response.parsed_output;
    if (!parsed?.body?.trim()) {
      return { ok: false, error: "the model returned nothing usable", retryable: true };
    }

    return {
      ok: true,
      prompt: shapePrompt(parsed, {
        model: response.model,
        inputTokens: response.usage.input_tokens,
        outputTokens: response.usage.output_tokens,
      }),
    };
  } catch (error) {
    // Most specific first: a bad key will never succeed on retry, a rate limit
    // or a 5xx will.
    if (error instanceof Anthropic.AuthenticationError) {
      return { ok: false, error: "the Anthropic API key was rejected", retryable: false };
    }
    if (error instanceof Anthropic.BadRequestError) {
      return { ok: false, error: `the request was refused: ${error.message.slice(0, 200)}`, retryable: false };
    }
    if (error instanceof Anthropic.RateLimitError) {
      return { ok: false, error: "rate limited by the Anthropic API", retryable: true };
    }
    if (error instanceof Anthropic.APIError) {
      return { ok: false, error: `Anthropic API error ${error.status}`, retryable: true };
    }
    return {
      ok: false,
      error: error instanceof Error ? error.message.slice(0, 200) : "generation failed",
      retryable: true,
    };
  }
}
