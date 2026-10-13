import "server-only";
import NextAuth from "next-auth";
import MicrosoftEntraID from "next-auth/providers/microsoft-entra-id";
import { prisma } from "@/server/db";
import { authConfig } from "./auth.config";
import { entraTenantId, normalizeEmail } from "./entra";
import { resolveSsoUser } from "./sso";

export const { handlers, auth, signIn, signOut } = NextAuth({
  ...authConfig,
  providers: [
    MicrosoftEntraID({
      clientId: process.env.AUTH_MICROSOFT_ENTRA_ID_ID,
      clientSecret: process.env.AUTH_MICROSOFT_ENTRA_ID_SECRET,
      issuer: process.env.AUTH_MICROSOFT_ENTRA_ID_ISSUER,
      // Work accounts often omit the `email` claim; the UPN is the sign-in address.
      // No profile photo: it would bloat the JWT cookie.
      profile(profile) {
        return {
          id: profile.sub,
          name: profile.name,
          email: normalizeEmail(profile.email || profile.preferred_username),
          image: null,
        };
      },
    }),
  ],
  callbacks: {
    ...authConfig.callbacks,
    async signIn({ user, profile }) {
      const tenant = entraTenantId();
      if (!tenant || (profile as { tid?: string } | undefined)?.tid !== tenant) {
        return "/login?error=wrong-tenant";
      }
      const result = await resolveSsoUser(user.email, user.name);
      return result.ok ? true : `/login?error=${result.reason}`;
    },
    async jwt({ token, user, account }) {
      const email = normalizeEmail(user?.email);
      if (account && email) {
        const dbUser = await prisma.user.findUnique({ where: { email }, select: { id: true, role: true } });
        if (dbUser) {
          token.uid = dbUser.id;
          token.role = dbUser.role;
        }
      }
      return token;
    },
  },
});
