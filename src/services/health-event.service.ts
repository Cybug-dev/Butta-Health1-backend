import { Prisma } from '../generated/prisma/client.js';
import { prisma } from '../config/database.js';
import { ApiError } from '../errors/api-error.js';
import type {
  CreateHealthEventInput,
  HealthEventQuery,
  UpdateHealthEventInput,
} from '../schemas/health-event.schemas.js';

export const eventSelect = {
  id: true,
  type: true,
  title: true,
  occurredAt: true,
  severity: true,
  symptoms: true,
  treatment: true,
  notes: true,
  source: true,
  status: true,
  createdAt: true,
  updatedAt: true,
} satisfies Prisma.HealthEventSelect;

const severityToDatabase = {
  Mild: 'MILD',
  Moderate: 'MODERATE',
  Severe: 'SEVERE',
  'Not specified': 'NOT_SPECIFIED',
} as const;

const severityFromDatabase = {
  MILD: 'Mild',
  MODERATE: 'Moderate',
  SEVERE: 'Severe',
  NOT_SPECIFIED: 'Not specified',
} as const;

const sourceToDatabase = { Typed: 'TYPED', Voice: 'VOICE', Preset: 'PRESET' } as const;
const sourceFromDatabase = { TYPED: 'Typed', VOICE: 'Voice', PRESET: 'Preset' } as const;

const statusToDatabase = {
  Confirmed: 'CONFIRMED',
  'Needs monitoring': 'NEEDS_MONITORING',
  Prepared: 'PREPARED',
} as const;

const statusFromDatabase = {
  CONFIRMED: 'Confirmed',
  NEEDS_MONITORING: 'Needs monitoring',
  PREPARED: 'Prepared',
} as const;

type SelectedHealthEvent = Prisma.HealthEventGetPayload<{ select: typeof eventSelect }>;

export function serializeHealthEvent(event: SelectedHealthEvent) {
  const { occurredAt, ...values } = event;
  return {
    ...values,
    eventDate: occurredAt.toISOString(),
    severity: severityFromDatabase[event.severity],
    source: sourceFromDatabase[event.source],
    status: statusFromDatabase[event.status],
    createdAt: event.createdAt.toISOString(),
    updatedAt: event.updatedAt.toISOString(),
  };
}

function createValues(input: CreateHealthEventInput) {
  return {
    type: input.type,
    title: input.title,
    occurredAt: new Date(input.eventDate),
    severity: severityToDatabase[input.severity],
    symptoms: input.symptoms,
    treatment: input.treatment,
    notes: input.notes,
    source: sourceToDatabase[input.source],
    status: statusToDatabase[input.status],
  };
}

function updateValues(input: UpdateHealthEventInput) {
  return {
    ...(input.type !== undefined ? { type: input.type } : {}),
    ...(input.title !== undefined ? { title: input.title } : {}),
    ...(input.eventDate !== undefined ? { occurredAt: new Date(input.eventDate) } : {}),
    ...(input.severity !== undefined ? { severity: severityToDatabase[input.severity] } : {}),
    ...(input.symptoms !== undefined ? { symptoms: input.symptoms } : {}),
    ...(input.treatment !== undefined ? { treatment: input.treatment } : {}),
    ...(input.notes !== undefined ? { notes: input.notes } : {}),
    ...(input.source !== undefined ? { source: sourceToDatabase[input.source] } : {}),
    ...(input.status !== undefined ? { status: statusToDatabase[input.status] } : {}),
  };
}

export async function listHealthEvents(userId: string, query: HealthEventQuery) {
  const where: Prisma.HealthEventWhereInput = {
    userId,
    ...(query.type ? { type: query.type } : {}),
    ...(query.severity ? { severity: severityToDatabase[query.severity] } : {}),
    ...(query.status ? { status: statusToDatabase[query.status] } : {}),
    ...(query.from || query.to ? {
      occurredAt: {
        ...(query.from ? { gte: new Date(query.from) } : {}),
        ...(query.to ? { lte: new Date(query.to) } : {}),
      },
    } : {}),
    ...(query.search ? {
      OR: [
        { title: { contains: query.search, mode: 'insensitive' } },
        { notes: { contains: query.search, mode: 'insensitive' } },
        { treatment: { contains: query.search, mode: 'insensitive' } },
        { symptoms: { has: query.search } },
      ],
    } : {}),
  };

  if (query.cursor) {
    const cursorExists = await prisma.healthEvent.findFirst({
      where: { id: query.cursor, userId },
      select: { id: true },
    });
    if (!cursorExists) throw new ApiError(400, 'INVALID_CURSOR', 'Pagination cursor is invalid.');
  }

  const events = await prisma.healthEvent.findMany({
    where,
    select: eventSelect,
    orderBy: [{ occurredAt: 'desc' }, { id: 'desc' }],
    take: query.limit + 1,
    ...(query.cursor ? { cursor: { id: query.cursor }, skip: 1 } : {}),
  });
  const hasMore = events.length > query.limit;
  const page = hasMore ? events.slice(0, query.limit) : events;

  return {
    events: page.map(serializeHealthEvent),
    nextCursor: hasMore ? page.at(-1)?.id ?? null : null,
  };
}

export async function getHealthEvent(userId: string, eventId: string) {
  const event = await prisma.healthEvent.findFirst({
    where: { id: eventId, userId },
    select: eventSelect,
  });
  if (!event) throw new ApiError(404, 'HEALTH_EVENT_NOT_FOUND', 'Health event not found.');
  return serializeHealthEvent(event);
}

export async function createHealthEvent(userId: string, input: CreateHealthEventInput) {
  const event = await prisma.healthEvent.create({
    data: {
      user: { connect: { id: userId } },
      ...createValues(input),
    },
    select: eventSelect,
  });
  return serializeHealthEvent(event);
}

export async function updateHealthEvent(userId: string, eventId: string, input: UpdateHealthEventInput) {
  const existing = await getHealthEvent(userId, eventId);
  if (existing.type === 'CHECK_IN' && input.type !== undefined) {
    throw new ApiError(409, 'CHECK_IN_TYPE_IMMUTABLE', 'Check-in event type cannot be changed.');
  }
  const event = await prisma.healthEvent.update({
    where: { id: eventId },
    data: updateValues(input),
    select: eventSelect,
  });
  return serializeHealthEvent(event);
}

export async function deleteHealthEvent(userId: string, eventId: string) {
  await prisma.$transaction(async (transaction) => {
    const owned = await transaction.healthEvent.findFirst({
      where: { id: eventId, userId },
      select: { id: true },
    });
    if (!owned) throw new ApiError(404, 'HEALTH_EVENT_NOT_FOUND', 'Health event not found.');
    await transaction.checkIn.updateMany({
      where: { userId, healthEventId: eventId },
      data: { healthEventId: null, respondedAt: null },
    });
    await transaction.healthEvent.delete({ where: { id: eventId } });
  });
}
