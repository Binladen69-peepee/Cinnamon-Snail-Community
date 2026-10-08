import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { DEFAULT_VOICE, type GenerationContext } from "@/lib/ai/context";
import { cohostConfigured, cohostProvider, generatePrompt } from "@/lib/ai/generate";

/**
 * The AI cohost writing through Groq (an OpenAI-compatible API).
 *
 * Groq is answered at the network edge here; what is asserted is the request
 * the cohost sends (the model held to the prompt's JSON schema, the voice and
 * rules in the system message) and how each kind of answer comes back to the
 * queue: a prompt, a rejected key that will never work, a rate limit that will.
 */

const context: GenerationContext = {
  space: null,
  voice: DEFAULT_VOICE,
  season: "autumn",
  themes: ["soup"],
  unanswered: [],
  upcomingEvents: [],
  recentLessons: [],
  engagement: { posts: 3, comments: 5, bestPost: null },
  recentPrompts: [],
};

const KEYS = ["GROQ_API_KEY", "GROQ_MODEL", "ANTHROPIC_API_KEY"] as const;
const saved: Record<string, string | undefined> = {};

beforeEach(() => {
  for (const key of KEYS) saved[key] = process.env[key];
  process.env.GROQ_API_KEY = "gsk_test_key";
  delete process.env.GROQ_MODEL;
  process.env.ANTHROPIC_API_KEY = "";
});

afterEach(() => {
  vi.unstubAllGlobals();
  for (const key of KEYS) {
    if (saved[key] === undefined) delete process.env[key];
    else process.env[key] = saved[key];
  }
});

function answer(status: number, body: unknown) {
  const fetchMock = vi.fn<(url: string, init?: RequestInit) => Promise<Response>>(
    async () => new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } }),
  );
  vi.stubGlobal("fetch", fetchMock);
  return fetchMock;
}

const reply = (content: string, finish = "stop") => ({
  model: "openai/gpt-oss-120b",
  choices: [{ finish_reason: finish, message: { content } }],
  usage: { prompt_tokens: 220, completion_tokens: 90 },
});

describe("which model writes", () => {
  it("prefers Groq when its key is set, falls back to Claude, and is off with neither", () => {
    expect(cohostProvider()).toBe("groq");
    process.env.GROQ_API_KEY = "";
    process.env.ANTHROPIC_API_KEY = "sk-ant-test";
    expect(cohostProvider()).toBe("anthropic");
    process.env.ANTHROPIC_API_KEY = "";
    expect(cohostProvider()).toBeNull();
    expect(cohostConfigured()).toBe(false);
  });
});

describe("generating through Groq", () => {
  it("holds the model to the prompt's schema and returns the prompt", async () => {
    const fetchMock = answer(
      200,
      reply(JSON.stringify({ body: "  What did you make from the back of the fridge this week?  ", rationale: "Low effort to answer.", pollOptions: [] })),
    );
    const result = await generatePrompt({ context, promptType: "experience" });

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.prompt.body).toBe("What did you make from the back of the fridge this week?");
    expect(result.prompt.model).toBe("openai/gpt-oss-120b");
    expect(result.prompt.inputTokens).toBe(220);

    const [url, init] = fetchMock.mock.calls[0]!;
    expect(url).toBe("https://api.groq.com/openai/v1/chat/completions");
    expect((init?.headers as Record<string, string>).Authorization).toBe("Bearer gsk_test_key");
    const sent = JSON.parse(String(init?.body));
    expect(sent.model).toBe("openai/gpt-oss-120b");
    expect(sent.response_format.type).toBe("json_schema");
    expect(sent.response_format.json_schema.strict).toBe(true);
    expect(sent.response_format.json_schema.schema.required).toEqual(["body", "rationale", "pollOptions"]);
    expect(sent.response_format.json_schema.schema.$schema).toBeUndefined();
    expect(sent.messages[0].role).toBe("system");
    expect(sent.messages[0].content).toContain("Exactly one question");
    expect(sent.messages[0].content).toContain("guilt-free");
  });

  it("keeps at most four poll options", async () => {
    answer(200, reply(JSON.stringify({ body: "Which do you make most?", rationale: "", pollOptions: ["a", " b ", "", "c", "d", "e"] })));
    const result = await generatePrompt({ context, promptType: "poll" });
    expect(result.ok && result.prompt.pollOptions).toEqual(["a", "b", "c", "d"]);
  });

  it("says a rejected key will not work on retry, and never echoes it", async () => {
    answer(401, { error: { message: "Invalid API Key" } });
    const result = await generatePrompt({ context, promptType: "experience" });
    expect(result).toEqual({ ok: false, error: "the Groq API key was rejected", retryable: false });
    expect(JSON.stringify(result)).not.toContain("gsk_test_key");
  });

  it("retries a rate limit and a server error", async () => {
    answer(429, { error: { message: "slow down" } });
    expect(await generatePrompt({ context, promptType: "experience" })).toMatchObject({ ok: false, retryable: true });
    answer(503, {});
    expect(await generatePrompt({ context, promptType: "experience" })).toMatchObject({ ok: false, retryable: true });
  });

  it("treats a cut-off or empty answer as nothing usable, and retries it", async () => {
    answer(200, reply('{"body":"What did you', "length"));
    expect(await generatePrompt({ context, promptType: "experience" })).toMatchObject({
      ok: false,
      error: "the model returned nothing usable",
      retryable: true,
    });
    answer(200, reply(JSON.stringify({ body: "   ", rationale: "", pollOptions: [] })));
    expect(await generatePrompt({ context, promptType: "experience" })).toMatchObject({ ok: false, retryable: true });
  });
});
