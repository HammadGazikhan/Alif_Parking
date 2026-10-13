import "server-only";
import { cache } from "react";
import { redirect } from "next/navigation";
import type { Role } from "@/generated/prisma/client";
import { prisma } from "@/server/db";
import { auth } from "@/server/auth";
import { fillMissingDirectoryProfile } from "@/server/auth/sso";
import { ForbiddenError, UnauthorizedError } from "@/server/errors";

export type CurrentUser = {
  id: string;
  name: string;
  email: string;
  role: Role;
  designation: string | null;
  avatarType: string | null;
};

/**
 * Resolve the signed-in user from the session cookie and re-validate against
 * the database on every request: role and active status always come from the
 * DB, never from client input.
 */
export const getCurrentUser = cache(async (): Promise<CurrentUser | null> => {
  const session = await auth();
  const id = session?.user?.id;
  if (!id) return null;

  const user = await prisma.user.findUnique({
    where: { id },
    select: {
      id: true,
      name: true,
      email: true,
      role: true,
      designation: true,
      avatarType: true,
      status: true,
    },
  });
  if (!user || user.status !== "ACTIVE") return null;

  const { status: _status, ...rest } = user;
  void _status;
  return rest;
});

export function homePathFor(role: Role): string {
  return role === "ADMIN" ? "/admin/dashboard" : "/employee/dashboard";
}

export const SESSION_EXPIRED_PATH = "/session-expired";

/* ----- Page guards (redirect) ------------------------------------------- */

export async function requireUserPage(): Promise<CurrentUser> {
  const user = await getCurrentUser();
  if (!user) redirect(SESSION_EXPIRED_PATH);
  return fillMissingDirectoryProfile(user);
}

export async function requireAdminPage(): Promise<CurrentUser> {
  const user = await requireUserPage();
  if (user.role !== "ADMIN") redirect(homePathFor(user.role));
  return user;
}

export async function requireEmployeePage(): Promise<CurrentUser> {
  const user = await requireUserPage();
  if (user.role !== "EMPLOYEE") redirect(homePathFor(user.role));
  return user;
}

/* ----- API guards (throw) ----------------------------------------------- */

export async function requireApiUser(): Promise<CurrentUser> {
  const user = await getCurrentUser();
  if (!user) throw new UnauthorizedError();
  return user;
}

export async function requireApiAdmin(): Promise<CurrentUser> {
  const user = await requireApiUser();
  if (user.role !== "ADMIN") throw new ForbiddenError();
  return user;
}

export async function requireApiEmployee(): Promise<CurrentUser> {
  const user = await requireApiUser();
  if (user.role !== "EMPLOYEE") throw new ForbiddenError();
  return user;
}
