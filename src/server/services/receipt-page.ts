import "server-only";
import { notFound } from "next/navigation";
import type { CurrentUser } from "@/server/auth/guards";
import { NotFoundError } from "@/server/errors";
import { getReceipt } from "@/server/services/payment.service";

/** Load a receipt for a page, mapping "not found / not yours / not paid" to a 404. */
export async function loadReceiptForPage(user: CurrentUser, paymentId: string) {
  try {
    return await getReceipt(user, paymentId);
  } catch (error) {
    if (error instanceof NotFoundError) notFound();
    throw error;
  }
}
