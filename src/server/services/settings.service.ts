import "server-only";
import type { ParkingSetting } from "@/generated/prisma/client";
import { prisma, type Db } from "@/server/db";
import { logAudit } from "@/server/services/audit.service";
import { rupeesToPaise } from "@/lib/money";
import type { ParkingSettingsInput } from "@/lib/validations/parking";
import type { CurrentUser } from "@/server/auth/guards";

/**
 * Initial values used only when the settings row has never been created.
 * Monthly amounts live on vehicle categories, not here.
 */
const BOOTSTRAP_SETTINGS = {
  dueDay: 10,
  lateFee: 5000,
  feesEnabled: true,
  currency: "INR",
};

export async function getSettings(db: Db = prisma): Promise<ParkingSetting> {
  const existing = await db.parkingSetting.findUnique({ where: { id: 1 } });
  if (existing) return existing;
  return db.parkingSetting.upsert({
    where: { id: 1 },
    update: {},
    create: { id: 1, ...BOOTSTRAP_SETTINGS },
  });
}

export async function updateSettings(actor: CurrentUser, input: ParkingSettingsInput) {
  const before = await getSettings();
  const data = {
    dueDay: input.dueDay,
    lateFee: rupeesToPaise(input.lateFee),
    feesEnabled: input.feesEnabled,
    updatedById: actor.id,
  };
  return prisma.$transaction(async (tx) => {
    const updated = await tx.parkingSetting.update({ where: { id: 1 }, data });
    await logAudit(
      {
        actorId: actor.id,
        action: "SETTINGS_UPDATED",
        entityType: "ParkingSetting",
        entityId: "1",
        description: "Updated parking settings",
        metadata: {
          before: { dueDay: before.dueDay, lateFee: before.lateFee, feesEnabled: before.feesEnabled },
          after: { dueDay: updated.dueDay, lateFee: updated.lateFee, feesEnabled: updated.feesEnabled },
        },
      },
      tx,
    );
    return updated;
  });
}
