import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { PrismaClient } from "@prisma/client";

/**
 * An email address is the key to whatever was bought under it.
 *
 * A purchase made before the buyer has an account waits as a PendingGrant on
 * the address. It must reach only an account that has proven it reads that
 * address's mail. Before this, two paths handed it to whoever typed the
 * address first: "Add email" in settings marked an address verified whenever a
 * purchase was waiting on it, and a password registration claimed purchases on
 * its (unproven) sign-in address. Exercised against the local Docker Postgres.
 */

const pending: Promise<unknown>[] = [];
vi.mock("next/server", async (importOriginal) => ({
  ...(await importOriginal<typeof import("next/server")>()),
  // `after` runs the task once the response is sent; here, straight away.
  after: (task: (() => unknown) | Promise<unknown>) => {
    pending.push(Promise.resolve().then(() => (typeof task === "function" ? task() : task)));
  },
}));

vi.hoisted(() => {
  // Empty rather than deleted: PrismaClient re-reads .env when it is created
  // and would put a deleted key back, sending real mail from a test.
  process.env.RESEND_API_KEY = "";
  process.env.KIT_API_KEY = "";
  process.env.KIT_API_SECRET = "";
});

const { requestEmailConfirmation, confirmEmailOwnership } = await import("@/lib/auth/email-confirmation");
const { registerAccount } = await import("@/lib/auth/register");
const { consumeMagicToken } = await import("@/lib/auth/magic-link");
const { getDevelopmentInbox, getTransactionalInbox } = await import("@/lib/email/send");

const prisma = new PrismaClient();
const stamp = Date.now().toString(36);
const userIds: string[] = [];
const addresses: string[] = [];
let productId = "";
let reachable = true;

const settle = async () => {
  await Promise.all(pending.splice(0));
};
const address = (label: string) => {
  const value = `${label}-${stamp}@ownership.test`;
  addresses.push(value);
  return value;
};

async function member(label: string) {
  const user = await prisma.user.create({
    data: {
      email: address(label),
      emailVerified: new Date(),
      name: `Owner ${label}`,
      handle: `own-${label}-${stamp}`,
      emails: { create: { email: `${label}-${stamp}@ownership.test`, isPrimary: true, verifiedAt: new Date() } },
    },
  });
  userIds.push(user.id);
  return user;
}

async function waitingPurchase(email: string) {
  return prisma.pendingGrant.create({ data: { email, productId, source: "SAMCART" } });
}

/** The raw token from the newest confirmation email sent to `email`. */
function confirmationToken(email: string) {
  const mail = getTransactionalInbox().filter((entry) => entry.to === email).at(-1);
  const match = mail?.html.match(/token=([A-Za-z0-9_-]+)/);
  return match?.[1] ?? "";
}

beforeAll(async () => {
  try {
    await prisma.$queryRaw`SELECT 1`;
  } catch {
    reachable = false;
    return;
  }
  const product = await prisma.product.create({
    data: { slug: `ownership-${stamp}`, name: "Ownership membership", kind: "MEMBERSHIP" },
  });
  productId = product.id;
});

afterAll(async () => {
  if (reachable) {
    const created = await prisma.user.findMany({ where: { email: { in: addresses } }, select: { id: true } });
    const ids = [...new Set([...userIds, ...created.map((row) => row.id)])];
    await prisma.pendingGrant.deleteMany({ where: { productId } });
    await prisma.auditLog.deleteMany({ where: { OR: [{ actorId: { in: ids } }, { targetId: { in: ids } }] } });
    await prisma.verificationToken.deleteMany({
      where: { OR: [{ identifier: { in: addresses } }, ...ids.map((id) => ({ identifier: { startsWith: `email-confirm:${id}:` } }))] },
    });
    await prisma.userEmail.deleteMany({ where: { OR: [{ userId: { in: ids } }, { email: { in: addresses } }] } });
    await prisma.user.deleteMany({ where: { id: { in: ids } } });
    await prisma.product.deleteMany({ where: { id: productId } });
  }
  await prisma.$disconnect();
});

describe("adding an email in settings", () => {
  it("adds it unverified, mails a link to it, and claims nothing", async () => {
    if (!reachable) return;
    const thief = await member("thief");
    const buyer = address("buyer");
    const grant = await waitingPurchase(buyer);

    expect(await requestEmailConfirmation(thief.id, buyer)).toBe("sent");
    await settle();

    const row = await prisma.userEmail.findUnique({ where: { email: buyer } });
    expect(row?.userId).toBe(thief.id);
    expect(row?.verifiedAt).toBeNull();
    expect((await prisma.pendingGrant.findUnique({ where: { id: grant.id } }))?.claimedAt).toBeNull();
    expect(await prisma.entitlement.count({ where: { userId: thief.id } })).toBe(0);
    // The link went to the address being added, not to the account asking.
    expect(confirmationToken(buyer)).not.toBe("");
  });

  it("does nothing when the link is opened in another account", async () => {
    if (!reachable) return;
    const asker = await member("asker");
    const bystander = await member("bystander");
    const second = address("second");
    expect(await requestEmailConfirmation(asker.id, second)).toBe("sent");
    await settle();

    expect(await confirmEmailOwnership(bystander.id, second, confirmationToken(second))).toBe("invalid");
    expect((await prisma.userEmail.findUnique({ where: { email: second } }))?.verifiedAt).toBeNull();
  });

  it("verifies the address and claims its purchase once the asker confirms", async () => {
    if (!reachable) return;
    const owner = await member("owner");
    const paidWith = address("paid-with");
    const grant = await waitingPurchase(paidWith);
    expect(await requestEmailConfirmation(owner.id, paidWith)).toBe("sent");
    await settle();
    const token = confirmationToken(paidWith);

    expect(await confirmEmailOwnership(owner.id, paidWith, token)).toBe("confirmed");
    expect((await prisma.userEmail.findUnique({ where: { email: paidWith } }))?.verifiedAt).not.toBeNull();
    expect((await prisma.pendingGrant.findUnique({ where: { id: grant.id } }))?.claimedAt).not.toBeNull();
    expect(await prisma.entitlement.count({ where: { userId: owner.id, productId, status: "ACTIVE" } })).toBe(1);
    // The link works once.
    expect(await confirmEmailOwnership(owner.id, paidWith, token)).toBe("used");
  });

  it("refuses an address that is already another account's", async () => {
    if (!reachable) return;
    const someone = await member("someone");
    const other = await member("other");
    expect(await requestEmailConfirmation(someone.id, other.email!)).toBe("unavailable");
    expect(await requestEmailConfirmation(someone.id, "not an email")).toBe("invalid");
    expect(await requestEmailConfirmation(someone.id, someone.email!)).toBe("already-verified");
  });
});

describe("the real owner of an address", () => {
  it("can still register with it after a stranger typed it into their settings", async () => {
    if (!reachable) return;
    const stranger = await member("stranger");
    const owned = address("owned");
    expect(await requestEmailConfirmation(stranger.id, owned)).toBe("sent");
    await settle();

    const result = await registerAccount({
      name: "Rightful Owner",
      email: owned,
      password: "a-long-and-unusual-passphrase-91",
      confirm: "a-long-and-unusual-passphrase-91",
      terms: true,
      ip: `10.1.${stamp.length}.1`,
    });
    await settle();
    expect(result.ok).toBe(true);
    const row = await prisma.userEmail.findUnique({ where: { email: owned } });
    expect(row?.userId).not.toBe(stranger.id);
  });

  it("gets nothing from a password registration alone, and everything from the first sign-in link", async () => {
    if (!reachable) return;
    const bought = address("bought");
    const grant = await waitingPurchase(bought);

    const result = await registerAccount({
      name: "Paying Buyer",
      email: bought,
      password: "another-long-unusual-passphrase-27",
      confirm: "another-long-unusual-passphrase-27",
      terms: true,
      ip: `10.2.${stamp.length}.2`,
    });
    await settle();
    expect(result.ok).toBe(true);
    // Typing the address proved nothing, so the purchase still waits.
    expect((await prisma.pendingGrant.findUnique({ where: { id: grant.id } }))?.claimedAt).toBeNull();

    // The registration sent a sign-in link to the address; opening it proves it.
    const link = getDevelopmentInbox().filter((entry) => entry.to === bought).at(-1);
    const token = link ? new URL(link.url).searchParams.get("token") ?? "" : "";
    const signedIn = await consumeMagicToken(bought, token);
    expect(signedIn?.email).toBe(bought);
    expect((await prisma.pendingGrant.findUnique({ where: { id: grant.id } }))?.claimedAt).not.toBeNull();
    expect(await prisma.entitlement.count({ where: { userId: signedIn!.id, productId, status: "ACTIVE" } })).toBe(1);
  });
});
