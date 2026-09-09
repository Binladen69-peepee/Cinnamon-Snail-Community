import { PrismaClient } from "@prisma/client";
import { createPost, addComment, toggleReaction } from "../lib/community/posts";
import { searchEntities } from "../lib/search";

const prisma = new PrismaClient();
const base = process.env.AUTH_URL ?? "http://localhost:3000";

function cookieJar(headers: Headers, previous = "") {
  const map = new Map<string, string>();
  for (const part of previous.split(";").map((item) => item.trim()).filter(Boolean)) {
    const [name, ...rest] = part.split("=");
    map.set(name, rest.join("="));
  }
  const set = headers.getSetCookie?.() ?? [];
  for (const line of set) {
    const [pair] = line.split(";");
    const [name, ...rest] = pair.split("=");
    if (name) map.set(name, rest.join("="));
  }
  return [...map.entries()].map(([name, value]) => `${name}=${value}`).join("; ");
}

async function signIn(email: string, password: string) {
  const csrfRes = await fetch(`${base}/api/auth/csrf`);
  const csrf = (await csrfRes.json()) as { csrfToken: string };
  let cookie = cookieJar(csrfRes.headers);
  const body = new URLSearchParams({
    csrfToken: csrf.csrfToken,
    email,
    password,
    callbackUrl: `${base}/home`,
    json: "true",
  });
  const loginRes = await fetch(`${base}/api/auth/callback/credentials`, {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
      Cookie: cookie,
    },
    body,
    redirect: "manual",
  });
  cookie = cookieJar(loginRes.headers, cookie);
  if (!cookie.includes("authjs.session-token") && !cookie.includes("__Secure-authjs.session-token")) {
    throw new Error(`Password sign-in failed for ${email}: ${loginRes.status}`);
  }
  return cookie;
}

async function pageHas(cookie: string, path: string, needles: string[]) {
  const res = await fetch(`${base}${path}`, {
    headers: { Cookie: cookie },
    redirect: "manual",
  });
  if (res.status >= 300 && res.status < 400) {
    throw new Error(`${path} redirected to ${res.headers.get("location")}`);
  }
  if (!res.ok) throw new Error(`${path} returned ${res.status}`);
  const html = await res.text();
  const missing = needles.filter((needle) => !html.includes(needle));
  if (missing.length) {
    throw new Error(`${path} missing: ${missing.join(", ")}`);
  }
  return html;
}

async function main() {
  const adam = await prisma.user.findUniqueOrThrow({
    where: { email: "adam@veganuniversity.test" },
    include: { profile: true },
  });
  const sam = await prisma.user.findUniqueOrThrow({
    where: { email: "member@veganuniversity.test" },
  });
  const space = await prisma.space.findUniqueOrThrow({ where: { slug: "kitchen-table" } });

  await prisma.profile.update({
    where: { userId: adam.id },
    data: {
      displayName: "Adam",
      bio: "Founder, host, and someone who wants the table to feel warm.",
      city: "Los Angeles",
      skillLevel: "advanced",
      cookingInterests: ["weeknight dinners", "gluten-free baking"],
    },
  });

  const post = await createPost({
    userId: adam.id,
    spaceId: space.id,
    type: "SIMPLE",
    title: "Phase 1 gate plate",
    body: "Sharing a plate from the live gate. @sam come taste this.",
  });
  await addComment({
    userId: sam.id,
    postId: post.id,
    body: "That smells like the kitchen is actually open.",
  });
  await toggleReaction({ userId: adam.id, postId: post.id, emoji: "💛" });

  const search = await searchEntities({ query: "kitchen" });
  const note = await prisma.notification.findFirst({
    where: { userId: adam.id, category: "REPLIES", href: `/posts/${post.id}` },
  });

  const cookie = await signIn("adam@veganuniversity.test", "vegan-local-dev");
  await pageHas(cookie, "/home", ["Welcome back", "Phase 1 gate plate"]);
  await pageHas(cookie, "/settings", ["Your profile", "Privacy"]);
  await pageHas(cookie, "/spaces", ["Kitchen Table"]);
  await pageHas(cookie, "/spaces/kitchen-table", ["Kitchen Table"]);
  await pageHas(cookie, `/posts/${post.id}`, ["Phase 1 gate plate", "That smells like"]);
  await pageHas(cookie, "/compose", ["Share with the table"]);
  await pageHas(cookie, "/search?q=kitchen", ["Kitchen"]);
  await pageHas(cookie, "/notifications", ["New reply in the kitchen"]);
  await pageHas(cookie, "/members", ["Adam"]);
  await pageHas(cookie, "/admin", ["Admin"]);

  const results = {
    signedIn: true,
    profileUpdated: Boolean(adam.profile),
    enteredSpace: true,
    createdPost: post.id,
    commented: true,
    reacted: true,
    searched: search.length > 0,
    notification: Boolean(note),
    pages: [
      "/home",
      "/settings",
      "/spaces",
      "/spaces/kitchen-table",
      `/posts/${post.id}`,
      "/compose",
      "/search",
      "/notifications",
      "/members",
      "/admin",
    ],
  };
  console.log(JSON.stringify(results, null, 2));
}

main()
  .catch((error) => {
    console.error(error);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
