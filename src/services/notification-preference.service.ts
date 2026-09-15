import { prisma } from '../config/database.js';
import type { NotificationPreferenceInput } from '../schemas/milestone-two.schemas.js';

const preferenceSelect = {
  eventReminders: true,
  weeklySummary: true,
  dailyCheckIn: true,
  checkInTime: true,
  timezone: true,
  createdAt: true,
  updatedAt: true,
} as const;

function serializePreference(preference: {
  eventReminders: boolean;
  weeklySummary: boolean;
  dailyCheckIn: boolean;
  checkInTime: string;
  timezone: string;
  createdAt: Date;
  updatedAt: Date;
}) {
  return {
    ...preference,
    createdAt: preference.createdAt.toISOString(),
    updatedAt: preference.updatedAt.toISOString(),
  };
}

export async function getNotificationPreference(userId: string) {
  const preference = await prisma.notificationPreference.findUniqueOrThrow({
    where: { userId },
    select: preferenceSelect,
  });
  return serializePreference(preference);
}

export async function putNotificationPreference(userId: string, input: NotificationPreferenceInput) {
  const preference = await prisma.notificationPreference.upsert({
    where: { userId },
    create: { userId, ...input },
    update: input,
    select: preferenceSelect,
  });
  return serializePreference(preference);
}
