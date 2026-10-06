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

const DEFAULT_PREFERENCE = {
  pushEnabled: true, emailEnabled: true, smsEnabled: true,
  jobUpdates: true, messages: true, connectionsAndInvites: true, marketingTips: true,
};

// SW doc Window 46 — no row means "everything on" (the app's default), so this
// returns synthetic defaults rather than 404ing for users who never touched it.
export async function getNotificationPreference(userId: string) {
  const pref = await prisma.notificationPreference.findUnique({ where: { userId } });
  return pref ?? { userId, ...DEFAULT_PREFERENCE };
}

export async function updateNotificationPreference(
  userId: string,
  data: Partial<typeof DEFAULT_PREFERENCE> & { providerPrefs?: Record<string, unknown> },
) {
  const { providerPrefs, ...flags } = data;
  // providerPrefs merges into what is stored so a partial update never wipes the other controls.
  const current = providerPrefs ? (await prisma.notificationPreference.findUnique({ where: { userId }, select: { providerPrefs: true } }))?.providerPrefs : null;
  const merged = providerPrefs ? { ...((current as Record<string, unknown> | null) ?? {}), ...providerPrefs } : undefined;
  return prisma.notificationPreference.upsert({
    where:  { userId },
    create: { userId, ...DEFAULT_PREFERENCE, ...flags, ...(merged ? { providerPrefs: merged as object } : {}) },
    update: { ...flags, ...(merged ? { providerPrefs: merged as object } : {}) },
  });
}
