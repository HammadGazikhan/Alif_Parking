import type { NextAuthConfig } from "next-auth";
import type { Role } from "@/generated/prisma/browser";

/**
 * Database-free Auth.js configuration shared by the proxy and the full auth
 * instance. Only reads the signed JWT; the full instance adds the Microsoft
 * provider and writes `uid`/`role` into the token at sign-in.
 */
export const authConfig = {
  pages: {
    signIn: "/login",
    error: "/login",
  },
  session: {
    strategy: "jwt",
    maxAge: 8 * 60 * 60,
  },
  trustHost: true,
  providers: [],
  callbacks: {
    session({ session, token }) {
      const claims = token as { uid?: string; role?: Role };
      if (claims.uid && claims.role) {
        session.user.id = claims.uid;
        session.user.role = claims.role;
      }
      return session;
    },
  },
} satisfies NextAuthConfig;
