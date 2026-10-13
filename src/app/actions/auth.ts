"use server";

import { signIn, signOut } from "@/server/auth";

/** Only same-origin paths; the proxy re-routes anything outside the user's area. */
function safeRedirect(callbackUrl: string | undefined) {
  return callbackUrl && callbackUrl.startsWith("/") && !callbackUrl.startsWith("//") ? callbackUrl : "/";
}

export async function microsoftSignInAction(callbackUrl?: string) {
  await signIn("microsoft-entra-id", { redirectTo: safeRedirect(callbackUrl) });
}

export async function logoutAction() {
  await signOut({ redirectTo: "/login" });
}
