import { DefaultSession } from "next-auth";

declare module "next-auth" {
  interface Session {
    user: DefaultSession["user"] & {
      id: string;
      handle: string;
      roles: string[];
    };
    sessionId: string;
  }
}

declare module "@auth/core/jwt" {
  interface JWT {
    sessionId?: string;
    handle?: string;
    roles?: string[];
  }
}
