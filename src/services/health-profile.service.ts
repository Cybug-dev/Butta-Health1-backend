import { Prisma } from '../generated/prisma/client.js';
import { prisma } from '../config/database.js';
import { ApiError } from '../errors/api-error.js';
import type { HealthProfileInput } from '../schemas/health-profile.schemas.js';

const healthProfileSelect = {
  id: true,
  dateOfBirth: true,
  sex: true,
  bloodGroup: true,
  allergies: true,
  existingConditions: true,
  currentMedications: true,
  emergencyContactName: true,
  emergencyContactPhone: true,
  createdAt: true,
  updatedAt: true,
} satisfies Prisma.HealthProfileSelect;

function serializeProfile(profile: Prisma.HealthProfileGetPayload<{ select: typeof healthProfileSelect }>) {
  return {
    ...profile,
    dateOfBirth: profile.dateOfBirth?.toISOString().slice(0, 10) ?? null,
  };
}

export async function getHealthProfile(userId: string) {
  const profile = await prisma.healthProfile.findUnique({
    where: { userId },
    select: healthProfileSelect,
  });
  if (!profile) throw new ApiError(404, 'HEALTH_PROFILE_NOT_FOUND', 'Health profile not found.');
  return serializeProfile(profile);
}

export async function putHealthProfile(userId: string, input: HealthProfileInput) {
  const values = {
    dateOfBirth: input.dateOfBirth ? new Date(`${input.dateOfBirth}T00:00:00.000Z`) : null,
    sex: input.sex ?? null,
    bloodGroup: input.bloodGroup ?? null,
    allergies: input.allergies,
    existingConditions: input.existingConditions,
    currentMedications: input.currentMedications,
    emergencyContactName: input.emergencyContactName ?? null,
    emergencyContactPhone: input.emergencyContactPhone ?? null,
  };
  const profile = await prisma.healthProfile.upsert({
    where: { userId },
    create: { userId, ...values },
    update: values,
    select: healthProfileSelect,
  });
  return serializeProfile(profile);
}
