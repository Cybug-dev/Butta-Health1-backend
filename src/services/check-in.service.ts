import { prisma } from '../config/database.js';
import { ApiError } from '../errors/api-error.js';
import type { CheckInResponseInput } from '../schemas/milestone-two.schemas.js';
import { eventSelect, serializeHealthEvent } from './health-event.service.js';
import { dateKeyAt } from '../utils/zoned-date.js';

const severityToDatabase = {
  Mild: 'MILD',
  Moderate: 'MODERATE',
  Severe: 'SEVERE',
  'Not specified': 'NOT_SPECIFIED',
} as const;

function promptFor(latest: { type: string; title: string; occurredAt: Date } | null, now: Date) {
  if (!latest) {
    return {
      promptType: 'FIRST_ENTRY' as const,
      promptText: 'How are you feeling today? Record any change you would want to remember later.',
    };
  }

  const hoursSince = (now.getTime() - latest.occurredAt.getTime()) / 3_600_000;
  if (hoursSince <= 72 && latest.type === 'MEDICATION') {
    return {
      promptType: 'MEDICATION_FOLLOW_UP' as const,
      promptText: `How did you feel after your recent medication entry, "${latest.title}"?`,
    };
  }
  if (hoursSince <= 72 && latest.type === 'SYMPTOM') {
    return {
      promptType: 'SYMPTOM_FOLLOW_UP' as const,
      promptText: `Has anything changed since you recorded "${latest.title}"?`,
    };
  }
  return {
    promptType: 'DAILY_REFLECTION' as const,
    promptText: 'What has changed in how you feel since your last health entry?',
  };
}

function serializeCheckIn(checkIn: {
  id: string;
  promptType: string;
  promptText: string;
  scheduledFor: Date;
  respondedAt: Date | null;
  healthEventId: string | null;
  createdAt: Date;
  updatedAt: Date;
}) {
  return {
    ...checkIn,
    scheduledFor: checkIn.scheduledFor.toISOString().slice(0, 10),
    respondedAt: checkIn.respondedAt?.toISOString() ?? null,
    createdAt: checkIn.createdAt.toISOString(),
    updatedAt: checkIn.updatedAt.toISOString(),
  };
}

const checkInSelect = {
  id: true,
  promptType: true,
  promptText: true,
  scheduledFor: true,
  respondedAt: true,
  healthEventId: true,
  createdAt: true,
  updatedAt: true,
} as const;

export async function getTodayCheckIn(userId: string, timezone: string, now = new Date()) {
  const dateKey = dateKeyAt(now, timezone);
  const scheduledFor = new Date(`${dateKey}T00:00:00.000Z`);
  const existing = await prisma.checkIn.findUnique({
    where: { userId_scheduledFor: { userId, scheduledFor } },
    select: checkInSelect,
  });
  if (existing) return serializeCheckIn(existing);

  const latest = await prisma.healthEvent.findFirst({
    where: { userId, type: { not: 'CHECK_IN' } },
    select: { type: true, title: true, occurredAt: true },
    orderBy: [{ occurredAt: 'desc' }, { id: 'desc' }],
  });
  const prompt = promptFor(latest, now);
  const checkIn = await prisma.checkIn.upsert({
    where: { userId_scheduledFor: { userId, scheduledFor } },
    create: { userId, scheduledFor, ...prompt },
    update: {},
    select: checkInSelect,
  });
  return serializeCheckIn(checkIn);
}

export async function respondToCheckIn(userId: string, checkInId: string, input: CheckInResponseInput, now = new Date()) {
  return prisma.$transaction(async (transaction) => {
    const checkIn = await transaction.checkIn.findFirst({
      where: { id: checkInId, userId },
      select: { id: true, promptText: true, respondedAt: true },
    });
    if (!checkIn) throw new ApiError(404, 'CHECK_IN_NOT_FOUND', 'Check-in not found.');
    if (checkIn.respondedAt) throw new ApiError(409, 'CHECK_IN_ALREADY_ANSWERED', 'This check-in has already been answered.');

    const claimed = await transaction.checkIn.updateMany({
      where: { id: checkInId, userId, respondedAt: null },
      data: { respondedAt: now },
    });
    if (claimed.count === 0) {
      throw new ApiError(409, 'CHECK_IN_ALREADY_ANSWERED', 'This check-in has already been answered.');
    }

    const healthEvent = await transaction.healthEvent.create({
      data: {
        userId,
        type: 'CHECK_IN',
        title: 'Daily health check-in',
        occurredAt: now,
        severity: severityToDatabase[input.severity],
        symptoms: input.symptoms,
        treatment: '',
        notes: input.notes,
        source: 'TYPED',
        status: 'CONFIRMED',
      },
      select: eventSelect,
    });
    const updated = await transaction.checkIn.update({
      where: { id: checkInId },
      data: { healthEventId: healthEvent.id },
      select: checkInSelect,
    });
    return { checkIn: serializeCheckIn(updated), healthEvent: serializeHealthEvent(healthEvent) };
  });
}

export async function listCheckIns(userId: string) {
  const checkIns = await prisma.checkIn.findMany({
    where: { userId },
    select: checkInSelect,
    orderBy: [{ scheduledFor: 'desc' }, { id: 'desc' }],
    take: 90,
  });
  return checkIns.map(serializeCheckIn);
}
