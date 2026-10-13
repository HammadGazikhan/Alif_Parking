import { signOut } from "@/server/auth";

/**
 * Clears a session cookie whose user no longer exists or was deactivated.
 * Redirecting such a session straight to /login would loop, because the
 * proxy only sees the still-valid JWT and bounces it back to the dashboard.
 */
export async function GET() {
  await signOut({ redirectTo: "/login" });
}
