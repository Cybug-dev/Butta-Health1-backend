import { prisma } from '../config/database.js';
import { eventSelect, serializeHealthEvent } from './health-event.service.js';
import { addCalendarDays, dateKeyAt, startOfZonedDay } from '../utils/zoned-date.js';

function profileCompletion(user: {
  firstName: string;
  lastName: string;
  email: string;
  healthProfile: null | {
    dateOfBirth: Date | null;
    sex: string | null;
    bloodGroup: string | null;
    allergies: string[];
    existingConditions: string[];
    currentMedications: string[];
    emergencyContactName: string | null;
    emergencyContactPhone: string | null;
  };
}) {
  const profile = user.healthProfile;
  const completed = [
    user.firstName,
    user.lastName,
    user.email,
    profile?.dateOfBirth,
    profile?.sex,
    profile?.bloodGroup,
    profile?.allergies.length,
    profile?.existingConditions.length,
    profile?.currentMedications.length,
    profile?.emergencyContactName,
    profile?.emergencyContactPhone,
  ].filter(Boolean).length;
  return Math.round((completed / 11) * 100);
}

function monthAfter(dateKey: string) {
  const [year = 0, month = 1] = dateKey.split('-').map(Number);
  const next = new Date(Date.UTC(year, month, 1));
  return next.toISOString().slice(0, 10);
}

export async function getDashboard(userId: string, timezone: string, now = new Date()) {
  const today = dateKeyAt(now, timezone);
  const monthStartKey = `${today.slice(0, 7)}-01`;
  const weekStartKey = addCalendarDays(today, -6);
  const tomorrowKey = addCalendarDays(today, 1);
  const monthStart = startOfZonedDay(monthStartKey, timezone);
  const nextMonthStart = startOfZonedDay(monthAfter(monthStartKey), timezone);
  const weekStart = startOfZonedDay(weekStartKey, timezone);
  const tomorrow = startOfZonedDay(tomorrowKey, timezone);

  const [user, totalEvents, eventsThisMonth, monitoringCount, symptomCount, recentEvents, weekEvents] = await prisma.$transaction([
    prisma.user.findUniqueOrThrow({
      where: { id: userId },
      select: {
        firstName: true, lastName: true, email: true, createdAt: true,
        healthProfile: {
          select: {
            dateOfBirth: true, sex: true, bloodGroup: true, allergies: true,
            existingConditions: true, currentMedications: true,
            emergencyContactName: true, emergencyContactPhone: true,
          },
        },
      },
    }),
    prisma.healthEvent.count({ where: { userId } }),
    prisma.healthEvent.count({ where: { userId, occurredAt: { gte: monthStart, lt: nextMonthStart } } }),
    prisma.healthEvent.count({ where: { userId, status: 'NEEDS_MONITORING' } }),
    prisma.healthEvent.count({ where: { userId, type: 'SYMPTOM' } }),
    prisma.healthEvent.findMany({
      where: { userId }, select: eventSelect,
      orderBy: [{ occurredAt: 'desc' }, { id: 'desc' }], take: 4,
    }),
    prisma.healthEvent.findMany({
      where: { userId, occurredAt: { gte: weekStart, lt: tomorrow } },
      select: { occurredAt: true },
    }),
  ]);

  const activityCounts = new Map<string, number>();
  for (const event of weekEvents) {
    const key = dateKeyAt(event.occurredAt, timezone);
    activityCounts.set(key, (activityCounts.get(key) ?? 0) + 1);
  }
  const activity = Array.from({ length: 7 }, (_, index) => {
    const date = addCalendarDays(weekStartKey, index);
    return {
      date,
      label: new Intl.DateTimeFormat('en', { weekday: 'short', timeZone: 'UTC' })
        .format(new Date(`${date}T12:00:00.000Z`)),
      count: activityCounts.get(date) ?? 0,
    };
  });

  const serializedRecent = recentEvents.map(serializeHealthEvent);
  return {
    profileCompletion: profileCompletion(user),
    totalEvents,
    eventsThisMonth,
    monitoringCount,
    symptomCount,
    memberSince: user.createdAt.toISOString(),
    latestEvent: serializedRecent[0] ?? null,
    recentEvents: serializedRecent,
    activity,
    timezone,
    generatedAt: now.toISOString(),
  };
}
