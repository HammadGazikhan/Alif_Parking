import { NextResponse } from "next/server";
import { requireApiUser } from "@/server/auth/guards";
import { ForbiddenError, NotFoundError } from "@/server/errors";
import { prisma } from "@/server/db";
import { route } from "@/server/http";

type Ctx = RouteContext<"/api/employees/[id]/avatar">;

/** Stored profile photo. Admins can see any employee; an employee can see their own. */
export const GET = route<Ctx>(async (_req, { params }) => {
  const user = await requireApiUser();
  const { id } = await params;
  if (user.role !== "ADMIN" && user.id !== id) throw new ForbiddenError();

  const row = await prisma.user.findUnique({ where: { id }, select: { avatar: true, avatarType: true } });
  if (!row?.avatar || !row.avatarType) throw new NotFoundError("Profile photo");

  return new NextResponse(Buffer.from(row.avatar), {
    headers: {
      "Content-Type": row.avatarType,
      "Cache-Control": "private, max-age=3600",
    },
  });
});
