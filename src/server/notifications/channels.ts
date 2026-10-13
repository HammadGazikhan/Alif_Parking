import "server-only";
import type { NotificationType } from "@/generated/prisma/client";
import type { Db } from "@/server/db";

export type NotificationMessage = {
  userId: string;
  type: NotificationType;
  title: string;
  body: string;
  link?: string;
};

export type NotificationRecipient = { id: string; name: string; email: string };

/**
 * A delivery channel. In-app delivery is persisted inside the caller's
 * transaction; external channels (email, SMS...) run after commit so that a
 * rolled-back transaction never sends a message.
 */
export interface NotificationChannel {
  readonly name: "IN_APP" | "EMAIL";
  readonly transactional: boolean;
  deliver(message: NotificationMessage, ctx: { db: Db; recipient?: NotificationRecipient }): Promise<void>;
}

export const inAppChannel: NotificationChannel = {
  name: "IN_APP",
  transactional: true,
  async deliver(message, { db }) {
    await db.notification.create({
      data: {
        userId: message.userId,
        type: message.type,
        channel: "IN_APP",
        title: message.title,
        body: message.body,
        link: message.link,
      },
    });
  },
};

/**
 * Email channel placeholder. Swap the body of `deliver` for an SMTP/Resend/SES
 * client when email delivery is enabled; callers do not need to change.
 */
export const emailChannel: NotificationChannel = {
  name: "EMAIL",
  transactional: false,
  async deliver(message, { recipient }) {
    if (process.env.EMAIL_NOTIFICATIONS_ENABLED !== "true") return;
    if (process.env.NODE_ENV !== "production") {
      console.info(`[email:stub] to=${recipient?.email ?? message.userId} subject="${message.title}"`);
    }
  },
};

export const channels: NotificationChannel[] = [inAppChannel, emailChannel];
