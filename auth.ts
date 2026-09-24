import NextAuth from "next-auth";
import { after } from "next/server";
import Credentials from "next-auth/providers/credentials";
import Google from "next-auth/providers/google";
import Facebook from "next-auth/providers/facebook";
import { randomBytes } from "crypto";
import { prisma } from "@/lib/db";
import { normalizeEmail } from "@/lib/community/format";
import { verifyPassword } from "@/lib/auth/password";
import { consumeRateLimit } from "@/lib/auth/rate-limit";
import { consumeMagicToken, findUserByAnyEmail } from "@/lib/auth/magic-link";
import { ensureMemberSetup } from "@/lib/auth/provision";
import { writeAuditLog } from "@/lib/audit";

const SESSION_TTL_MS = 30 * 24 * 60 * 60 * 1000;

/**
 * How long a JWT may be trusted before the account and session row are
 * re-checked. Revoking a session takes effect within this window rather than
 * instantly, which is the trade for not querying on every request.
 */
const REVALIDATE_MS = 5 * 60 * 1000;

type MutableToken = Record<string, unknown>;

async function hydrateFromDatabase(token: MutableToken, userId: string) {
  const dbUser = await prisma.user.findUnique({
    where: { id: userId },
    include: { roles: { include: { role: true } } },
  });
  if (!dbUser) return;
  token.handle = dbUser.handle;
  token.roles = dbUser.roles.map((item) => item.role.name);
  token.email = dbUser.email;
  token.name = dbUser.name ?? undefined;
  token.picture = dbUser.image ?? undefined;
}

/**
 * Which social sign-ins are configured.
 *
 * Registered only when their credentials exist, so a deployment without them
 * does not advertise a button that fails the moment it is pressed. `enabled`
 * below reads the same variables, which is what keeps the login page and the
 * auth config from disagreeing about what is available.
 */
export const socialSignIn = {
  google: Boolean(process.env.AUTH_GOOGLE_ID && process.env.AUTH_GOOGLE_SECRET),
  facebook: Boolean(
    process.env.AUTH_FACEBOOK_ID && process.env.AUTH_FACEBOOK_SECRET,
  ),
};

function socialProviders() {
  const providers = [];
  if (socialSignIn.google) {
    providers.push(
      Google({
        clientId: process.env.AUTH_GOOGLE_ID,
        clientSecret: process.env.AUTH_GOOGLE_SECRET,
        // Members arrive with a verified address from Google, which is the
        // whole point of using it; asking them to verify it again is theatre.
        allowDangerousEmailAccountLinking: true,
      }),
    );
  }
  if (socialSignIn.facebook) {
    providers.push(
      Facebook({
        clientId: process.env.AUTH_FACEBOOK_ID,
        clientSecret: process.env.AUTH_FACEBOOK_SECRET,
        allowDangerousEmailAccountLinking: true,
      }),
    );
  }
  return providers;
}

export const { handlers, auth, signIn, signOut } = NextAuth({
  trustHost: true,
  secret: process.env.AUTH_SECRET,
  session: { strategy: "jwt", maxAge: 60 * 60 * 24 * 30 },
  pages: { signIn: "/login" },
  providers: [
    Credentials({
      credentials: {
        email: { label: "Email", type: "email" },
        password: { label: "Password", type: "password" },
        magicToken: { label: "Token", type: "text" },
      },
      authorize: async (credentials) => {
        const email = String(credentials?.email ?? "");
        const password = String(credentials?.password ?? "");
        const magicToken = String(credentials?.magicToken ?? "");
        if (!email) return null;

        if (magicToken) {
          const user = await consumeMagicToken(email, magicToken);
          if (!user) return null;
          return {
            id: user.id,
            email: user.email,
            name: user.name,
            image: user.image,
          };
        }

        const limit = await consumeRateLimit(
          `password:${normalizeEmail(email)}`,
          8,
          15 * 60 * 1000,
        );
        if (!limit.ok) return null;
        const user = await findUserByAnyEmail(email);
        if (!user?.passwordHash) return null;
        const valid = await verifyPassword(password, user.passwordHash);
        if (!valid || user.status !== "ACTIVE") return null;
        await ensureMemberSetup(user.id, user.email, user.name);
        return {
          id: user.id,
          email: user.email,
          name: user.name,
          image: user.image,
        };
      },
    }),
    ...socialProviders(),
  ],
  callbacks: {
    async jwt({ token, user, trigger }) {
      if (!process.env.DATABASE_URL) {
        return token;
      }

      // --- Sign-in: the only moment that must touch the database ----------
      if (user?.id) {
        const session = await prisma.session.create({
          data: {
            sessionToken: randomBytes(32).toString("hex"),
            userId: user.id,
            expires: new Date(Date.now() + SESSION_TTL_MS),
          },
        });
        token.sub = user.id;
        token.sessionId = session.id;
        await hydrateFromDatabase(token, user.id);
        token.checkedAt = Date.now();

        // None of these gate the sign-in response.
        after(async () => {
          const now = new Date();
          await prisma.user
            .update({
              where: { id: user.id! },
              data: { lastLoginAt: now },
            })
            .catch(() => undefined);

          // First sign-in ever: stamps the row and queues the welcome DM. The
          // stamp is a guarded update inside noteFirstLogin, so signing in on
          // two devices at once still produces exactly one welcome. Failure
          // here must never cost someone their session, hence the catch.
          const { noteFirstLogin } = await import("@/lib/messages/welcome");
          const outcome = await noteFirstLogin(user.id!, now).catch(() => null);

          await writeAuditLog({
            actorId: user.id,
            action: "auth.session.created",
            targetType: "session",
            targetId: session.id,
          }).catch(() => undefined);

          if (outcome?.firstLogin) {
            await writeAuditLog({
              actorId: user.id,
              action: "auth.first_login",
              targetType: "user",
              targetId: user.id!,
              metadata: { welcomeDmScheduled: outcome.scheduled },
            }).catch(() => undefined);
          }
        });
        return token;
      }

      if (!token.sub) return token;

      // --- Every other request: serve from the token -----------------------
      // The previous implementation re-read the user and the session row on
      // every call. auth() runs three times per member page (page, shell,
      // nav), so that was six cross-region round trips per page load, and any
      // one of them failing cleared sessionId and logged the member out.
      const lastChecked = typeof token.checkedAt === "number" ? token.checkedAt : 0;
      const stale = Date.now() - lastChecked > REVALIDATE_MS;
      if (!stale && trigger !== "update") {
        return token;
      }

      try {
        const [dbUser, dbSession] = await Promise.all([
          prisma.user.findUnique({
            where: { id: token.sub },
            include: { roles: { include: { role: true } } },
          }),
          token.sessionId
            ? prisma.session.findUnique({
                where: { id: String(token.sessionId) },
              })
            : Promise.resolve(null),
        ]);

        // Definitive answers only: sign the member out when the database says
        // the account or session is genuinely gone, revoked or expired.
        if (!dbUser || dbUser.status !== "ACTIVE") {
          token.sessionId = undefined;
          return token;
        }
        if (
          token.sessionId &&
          (!dbSession || dbSession.revokedAt || dbSession.expires < new Date())
        ) {
          token.sessionId = undefined;
          return token;
        }

        token.handle = dbUser.handle;
        token.roles = dbUser.roles.map((item) => item.role.name);
        token.email = dbUser.email;
        token.name = dbUser.name ?? undefined;
        token.picture = dbUser.image ?? undefined;
        token.checkedAt = Date.now();
      } catch {
        // Fail open. A timeout or a dropped connection is not evidence that
        // the member's session is invalid, and treating it as such is what
        // logged people out at random. The token keeps working and the next
        // revalidation tries again.
      }
      return token;
    },
    async session({ session, token }) {
      if (!token.sub || !token.sessionId) {
        return { ...session, user: session.user, sessionId: "" };
      }
      session.sessionId = String(token.sessionId);
      session.user.id = token.sub;
      session.user.email = String(token.email ?? "");
      session.user.name = typeof token.name === "string" ? token.name : session.user.name;
      session.user.image =
        typeof token.picture === "string" ? token.picture : session.user.image;
      session.user.handle = String(token.handle ?? "");
      session.user.roles = Array.isArray(token.roles) ? token.roles.map(String) : [];
      return session;
    },
  },
});

// The revocation list lives in its own module so that anything which needs to
// strike a session off does not have to import the Auth.js runtime to do it.
export { revokeSession, revokeAllSessions } from "@/lib/auth/sessions";
