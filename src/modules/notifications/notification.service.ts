import { prisma } from "../../lib/prisma";

export async function getNotifications(
  userId: string,
  unreadOnly: boolean,
): Promise<{ notifications: object[]; unreadCount: number }> {
  const where = unreadOnly ? { userId, read: false } : { userId };

  const [notifications, unreadCount] = await Promise.all([
    prisma.notification.findMany({
      where,
      orderBy: { createdAt: "desc" },
    }),
    prisma.notification.count({ where: { userId, read: false } }),
  ]);

  return { notifications, unreadCount };
}

export async function markOneRead(
  userId: string,
  notificationId: string,
): Promise<void> {
  // Only update if the notification belongs to this user.
  await prisma.notification.updateMany({
    where: { id: notificationId, userId },
    data: { read: true },
  });
}

export async function markAllRead(userId: string): Promise<void> {
  await prisma.notification.updateMany({
    where: { userId, read: false },
    data: { read: true },
  });
}
