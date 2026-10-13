import { z } from "zod";
import { requireApiAdmin } from "@/server/auth/guards";
import { ok, parseQuery, route } from "@/server/http";
import { listAuditLogs } from "@/server/services/audit.service";
import { paginationSchema } from "@/lib/validations/common";
import { AuditAction } from "@/generated/prisma/browser";

const querySchema = paginationSchema.extend({
  action: z.enum(Object.values(AuditAction) as [AuditAction, ...AuditAction[]]).optional(),
  entityType: z.string().max(40).optional(),
  search: z.string().trim().max(100).optional(),
});

export const GET = route(async (req) => {
  await requireApiAdmin();
  return ok(await listAuditLogs(parseQuery(req, querySchema)));
});
