import { NextResponse } from "next/server";
import { requireApiAdmin } from "@/server/auth/guards";
import { NotFoundError } from "@/server/errors";
import { directoryPhotoForEmail } from "@/server/directory/graph";
import { route } from "@/server/http";

type Ctx = RouteContext<"/api/directory/users/[id]/photo">;

/** Preview photo while an admin is adding someone. Nothing is returned when Entra has no picture. */
export const GET = route<Ctx>(async (req, { params }) => {
  await requireApiAdmin();
  const { id } = await params;
  const email = new URL(req.url).searchParams.get("email")?.trim().toLowerCase() ?? "";
  if (!email) throw new NotFoundError("Profile photo");

  const photo = await directoryPhotoForEmail(id, email);
  if (!photo) throw new NotFoundError("Profile photo");

  return new NextResponse(Buffer.from(photo.bytes), {
    headers: {
      "Content-Type": photo.contentType,
      "Cache-Control": "private, max-age=300",
    },
  });
});
