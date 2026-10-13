import "server-only";
import type { AuditAction, Prisma } from "@/generated/prisma/client";
import { prisma, type Db } from "@/server/db";
import type { PaginationInput } from "@/server/services/pagination";
import { paginate } from "@/server/services/pagination";

export type AuditEntry = {
  actorId: string | null;
  action: AuditAction;
  entityType: string;
  entityId?: string | null;
  description: string;
  metadata?: Prisma.InputJsonValue;
};

export async function logAudit(entry: AuditEntry, db: Db = prisma) {
  await db.auditLog.create({
    data: {
      actorId: entry.actorId,
      action: entry.action,
      entityType: entry.entityType,
      entityId: entry.entityId ?? null,
      description: entry.description,
      metadata: entry.metadata,
    },
  });
}

export async function listAuditLogs(
  query: PaginationInput & { action?: AuditAction; entityType?: string; search?: string },
) {
  const where: Prisma.AuditLogWhereInput = {
    ...(query.action ? { action: query.action } : {}),
    ...(query.entityType ? { entityType: query.entityType } : {}),
    ...(query.search
      ? {
          OR: [
            { description: { contains: query.search, mode: "insensitive" } },
            { entityId: { contains: query.search, mode: "insensitive" } },
            { actor: { name: { contains: query.search, mode: "insensitive" } } },
          ],
        }
      : {}),
  };
  const [items, total] = await Promise.all([
    prisma.auditLog.findMany({
      where,
      orderBy: { createdAt: "desc" },
      skip: (query.page - 1) * query.pageSize,
      take: query.pageSize,
      include: { actor: { select: { id: true, name: true, email: true } } },
    }),
    prisma.auditLog.count({ where }),
  ]);
  return paginate(items, total, query);
}
