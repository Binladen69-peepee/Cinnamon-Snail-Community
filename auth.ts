import NextAuth from "next-auth";
import Credentials from "next-auth/providers/credentials";
import { randomBytes } from "crypto";
import { prisma } from "@/lib/db";
import { normalizeEmail } from "@/lib/community/format";
import { verifyPassword } from "@/lib/auth/password";
import { consumeRateLimit } from "@/lib/auth/rate-limit";
import { consumeMagicToken, findUserByAnyEmail } from "@/lib/auth/magic-link";
import { ensureMemberSetup } from "@/lib/auth/provision";
import { writeAuditLog } from "@/lib/audit";

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

        const limit = consumeRateLimit(`password:${normalizeEmail(email)}`, 8, 15 * 60 * 1000);
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
  ],
  callbacks: {
    async jwt({ token, user }) {
      if (user?.id) {
        const session = await prisma.session.create({
          data: {
            sessionToken: randomBytes(32).toString("hex"),
            userId: user.id,
            expires: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
          },
        });
        token.sub = user.id;
        token.sessionId = session.id;
        await prisma.user.update({
          where: { id: user.id },
          data: { lastLoginAt: new Date() },
        });
        await writeAuditLog({
          actorId: user.id,
          action: "auth.session.created",
          targetType: "session",
          targetId: session.id,
        });
      }
      if (token.sub) {
        const dbUser = await prisma.user.findUnique({
          where: { id: token.sub },
          include: { roles: { include: { role: true } } },
        });
        if (!dbUser || dbUser.status !== "ACTIVE") {
          token.sessionId = undefined;
          return token;
        }
        token.handle = dbUser.handle;
        token.roles = dbUser.roles.map((item) => item.role.name);
        token.email = dbUser.email;
        token.name = dbUser.name ?? undefined;
        token.picture = dbUser.image ?? undefined;
      }
      if (token.sessionId) {
        const dbSession = await prisma.session.findUnique({
          where: { id: String(token.sessionId) },
        });
        if (!dbSession || dbSession.revokedAt || dbSession.expires < new Date()) {
          token.sessionId = undefined;
        }
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

export async function revokeSession(sessionId: string, actorId: string) {
  await prisma.session.update({
    where: { id: sessionId },
    data: { revokedAt: new Date() },
  });
  await writeAuditLog({
    actorId,
    action: "auth.session.revoked",
    targetType: "session",
    targetId: sessionId,
  });
}

export async function revokeAllSessions(userId: string) {
  await prisma.session.updateMany({
    where: { userId, revokedAt: null },
    data: { revokedAt: new Date() },
  });
  await writeAuditLog({
    actorId: userId,
    action: "auth.session.revoked_all",
    targetType: "user",
    targetId: userId,
  });
}
