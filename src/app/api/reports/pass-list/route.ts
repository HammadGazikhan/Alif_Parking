import { monthName } from "@/lib/dates";
import { passListQuerySchema } from "@/lib/validations/payment";
import { requireApiAdmin } from "@/server/auth/guards";
import { prisma } from "@/server/db";
import { parseQuery, route } from "@/server/http";
import { buildPassListWorkbook } from "@/server/services/pass-list.service";

export const GET = route(async (req) => {
  const admin = await requireApiAdmin();
  const query = parseQuery(req, passListQuerySchema);
  const record = await prisma.user.findUnique({ where: { id: admin.id }, select: { phone: true } });
  const buffer = await buildPassListWorkbook(query, { name: admin.name, phone: record?.phone ?? null });
  const filename = `Parking ${monthName(query.month)} ${query.year}.xlsx`;

  return new Response(new Uint8Array(buffer), {
    headers: {
      "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": `attachment; filename="${filename}"`,
      "Cache-Control": "no-store",
    },
  });
});
