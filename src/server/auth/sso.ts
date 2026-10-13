import "server-only";
import type { Role } from "@/generated/prisma/client";
import { prisma } from "@/server/db";
import { logAudit } from "@/server/services/audit.service";
import { directoryPhotoForEmail, searchDirectoryUsers } from "@/server/directory/graph";
import { bootstrapAdminEmails, normalizeEmail } from "./entra";

export type SsoDenial = "not-registered" | "inactive" | "no-email";
export type SsoResult = { ok: true; user: { id: string; role: Role } } | { ok: false; reason: SsoDenial };

/**
 * Decide whether a Microsoft-authenticated person may enter the portal. Only
 * people an admin has registered (by work email) get in, plus bootstrap admins,
 * who are created or promoted on sign-in.
 */
export async function resolveSsoUser(rawEmail: string | null | undefined, name?: string | null): Promise<SsoResult> {
  const email = normalizeEmail(rawEmail);
  if (!email) return { ok: false, reason: "no-email" };
  const isBootstrapAdmin = bootstrapAdminEmails().includes(email);
  const now = new Date();

  const existing = await prisma.user.findUnique({ where: { email }, select: { id: true, role: true, status: true } });
  if (!existing) {
    if (!isBootstrapAdmin) return { ok: false, reason: "not-registered" };
    const created = await prisma.$transaction(async (tx) => {
      const user = await tx.user.create({
        data: { email, name: name?.trim() || email.split("@")[0]!, role: "ADMIN", parkingEligible: false, lastLoginAt: now },
        select: { id: true, role: true, name: true },
      });
      await logAudit(
        {
          actorId: user.id,
          action: "EMPLOYEE_CREATED",
          entityType: "Employee",
          entityId: email,
          description: `Created administrator ${user.name} on first Microsoft sign-in`,
          metadata: { userId: user.id, bootstrap: true },
        },
        tx,
      );
      return user;
    });
    return { ok: true, user: { id: created.id, role: created.role } };
  }

  if (existing.status !== "ACTIVE") return { ok: false, reason: "inactive" };
  const promote = isBootstrapAdmin && existing.role !== "ADMIN";
  const updated = await prisma.user.update({
    where: { id: existing.id },
    data: { lastLoginAt: now, ...(promote ? { role: "ADMIN" } : {}) },
    select: { id: true, role: true },
  });
  return { ok: true, user: updated };
}

const directoryProfileChecked = new Set<string>();

/**
 * Copy a missing job title or profile photo from Microsoft. Runs at most once
 * per process for each user, and never replaces a value an admin already saved.
 */
export async function fillMissingDirectoryProfile<T extends { id: string; email: string; designation: string | null; avatarType: string | null }>(
  user: T,
): Promise<T> {
  if ((user.designation && user.avatarType) || directoryProfileChecked.has(user.id)) return user;
  directoryProfileChecked.add(user.id);
  try {
    const people = await searchDirectoryUsers(user.email, 5);
    const person = people.find((p) => p.email === user.email || p.upn === user.email);
    if (!person) return user;
    const designation = user.designation ?? (person.jobTitle?.trim().slice(0, 80) || null);
    const photo = user.avatarType || !person.id ? null : await directoryPhotoForEmail(person.id, user.email);
    if (designation === user.designation && !photo) return user;
    const updated = await prisma.user.update({
      where: { id: user.id },
      data: {
        ...(user.designation == null && designation ? { designation } : {}),
        ...(photo ? { avatar: photo.bytes, avatarType: photo.contentType } : {}),
      },
      select: { designation: true, avatarType: true },
    });
    return { ...user, designation: updated.designation, avatarType: updated.avatarType };
  } catch (error) {
    console.error("[directory] could not copy profile for signed-in user", error);
    return user;
  }
}
