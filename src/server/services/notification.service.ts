import "server-only";
import { prisma, type Db } from "@/server/db";
import { channels, type NotificationMessage } from "@/server/notifications/channels";
import { formatINR } from "@/lib/money";
import { formatDayMonth, monthName } from "@/lib/dates";

/**
 * Deliver via transactional channels using `db` (may be a transaction).
 * Returns a function that dispatches non-transactional channels; call it after
 * the surrounding transaction commits.
 */
export async function notify(messages: NotificationMessage | NotificationMessage[], db: Db = prisma) {
  const list = Array.isArray(messages) ? messages : [messages];
  for (const message of list) {
    for (const channel of channels.filter((c) => c.transactional)) {
      await channel.deliver(message, { db });
    }
  }
  return async function dispatchExternal() {
    const external = channels.filter((c) => !c.transactional);
    if (!external.length || !list.length) return;
    const recipients = await prisma.user.findMany({
      where: { id: { in: [...new Set(list.map((m) => m.userId))] } },
      select: { id: true, name: true, email: true },
    });
    const byId = new Map(recipients.map((r) => [r.id, r]));
    await Promise.allSettled(
      list.flatMap((message) =>
        external.map((c) => c.deliver(message, { db: prisma, recipient: byId.get(message.userId) })),
      ),
    );
  };
}

/* ----- Message templates ------------------------------------------------- */

type FeeLike = { month: number; year: number; amount: number; dueDate: Date; userId: string; id: string };

export const messages = {
  feeDue(fee: FeeLike): NotificationMessage {
    return {
      userId: fee.userId,
      type: "PAYMENT_DUE",
      title: `${monthName(fee.month)} parking fee is due`,
      body: `Your ${monthName(fee.month)} parking fee of ${formatINR(fee.amount)} is due on ${formatDayMonth(fee.dueDate)}.`,
      link: `/employee/pay/${fee.id}`,
    };
  },
  feeOverdue(fee: FeeLike): NotificationMessage {
    return {
      userId: fee.userId,
      type: "PAYMENT_OVERDUE",
      title: `${monthName(fee.month)} parking fee is overdue`,
      body: `Your ${monthName(fee.month)} parking fee of ${formatINR(fee.amount)} is overdue. Please pay at the earliest.`,
      link: `/employee/pay/${fee.id}`,
    };
  },
  paymentSuccess(fee: FeeLike, paymentId: string): NotificationMessage {
    return {
      userId: fee.userId,
      type: "PAYMENT_SUCCESS",
      title: "Payment successful",
      body: `Your ${monthName(fee.month)} parking payment of ${formatINR(fee.amount)} was successful.`,
      link: `/employee/payments/${paymentId}/receipt`,
    };
  },
  paymentFailed(fee: FeeLike): NotificationMessage {
    return {
      userId: fee.userId,
      type: "PAYMENT_FAILED",
      title: "Payment not completed",
      body: `Your ${monthName(fee.month)} parking payment could not be completed. You can try again from your dashboard.`,
      link: `/employee/pay/${fee.id}`,
    };
  },
};

/* ----- Queries ----------------------------------------------------------- */

export async function listNotifications(userId: string, limit = 20) {
  const [items, unread] = await Promise.all([
    prisma.notification.findMany({
      where: { userId, channel: "IN_APP" },
      orderBy: { createdAt: "desc" },
      take: limit,
    }),
    prisma.notification.count({ where: { userId, channel: "IN_APP", readAt: null } }),
  ]);
  return { items, unread };
}

export async function markNotificationsRead(userId: string, ids?: string[]) {
  const result = await prisma.notification.updateMany({
    where: { userId, readAt: null, ...(ids?.length ? { id: { in: ids } } : {}) },
    data: { readAt: new Date() },
  });
  return result.count;
}
