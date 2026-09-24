import { after } from "next/server";

/**
 * Runs work that should not hold up the response.
 *
 * Inside a request this is `after()`: the member gets their answer and the
 * notification fan-out, the search indexing and the audit row happen behind
 * it.
 *
 * Outside a request — a cron job, a seed script, a test — `after()` throws.
 * That turned the domain layer into something only a web request could call,
 * which is exactly backwards: `createPost` is called by the scheduler and by
 * the seed too, and neither should have to know that publishing a post happens
 * to defer some of its work.
 *
 * So outside a request the work is simply done, and awaited. A script that
 * creates a post and exits must not exit before the notifications it caused
 * have been written.
 */
export async function afterResponse(work: () => Promise<void>): Promise<void> {
  try {
    after(work);
  } catch {
    await work().catch(() => undefined);
  }
}
