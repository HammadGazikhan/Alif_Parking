import { redirect } from "next/navigation";
import { getCurrentUser, homePathFor, SESSION_EXPIRED_PATH } from "@/server/auth/guards";

export default async function Home() {
  const user = await getCurrentUser();
  redirect(user ? homePathFor(user.role) : SESSION_EXPIRED_PATH);
}
