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
 * as fields instead of something to parse out of prose. The whole thing is off
 * when `ANTHROPIC_API_KEY` is unset — the schedule still runs, finds it cannot
 * generate, and says so.
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

export function cohostConfigured(): boolean {
  return Boolean(process.env.ANTHROPIC_API_KEY);
}

const MODEL = process.env.ANTHROPIC_MODEL || "claude-opus-5-5";

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
  if (!cohostConfigured()) {
    return { ok: false, error: "ANTHROPIC_API_KEY is not configured", retryable: false };
  }

  const client = new Anthropic();
  const brief = [
    contextBrief(input.context, input.promptType),
    "",
    PROMPT_TYPE_BRIEF[input.promptType],
    input.note ? `\nThe reviewer asked for another try: ${input.note}` : "",
  ]
    .filter(Boolean)
    .join("\n");

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
      prompt: {
        body: parsed.body.trim(),
        rationale: parsed.rationale?.trim() ?? "",
        pollOptions: (parsed.pollOptions ?? [])
          .map((option) => option.trim())
          .filter(Boolean)
          .slice(0, 4),
        model: response.model,
        inputTokens: response.usage.input_tokens,
        outputTokens: response.usage.output_tokens,
      },
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
