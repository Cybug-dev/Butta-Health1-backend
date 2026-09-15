import { Prisma } from '../generated/prisma/client.js';
import { prisma } from '../config/database.js';
import { AI_CONSENT_POLICY_VERSION } from '../schemas/ai-consent.schemas.js';

const consentSelect = {
  granted: true,
  policyVersion: true,
  grantedAt: true,
  revokedAt: true,
  updatedAt: true,
} satisfies Prisma.AiConsentSelect;

function serializeConsent(consent: Prisma.AiConsentGetPayload<{ select: typeof consentSelect }>) {
  return {
    granted: consent.granted,
    policyVersion: consent.policyVersion,
    grantedAt: consent.grantedAt?.toISOString() ?? null,
    revokedAt: consent.revokedAt?.toISOString() ?? null,
    updatedAt: consent.updatedAt.toISOString(),
  };
}

export async function getAiConsent(userId: string) {
  const consent = await prisma.aiConsent.findUnique({ where: { userId }, select: consentSelect });
  if (!consent) {
    return { granted: false, policyVersion: AI_CONSENT_POLICY_VERSION, grantedAt: null, revokedAt: null, updatedAt: null };
  }
  return serializeConsent(consent);
}

export async function setAiConsent(userId: string, granted: boolean) {
  const now = new Date();
  const consent = await prisma.aiConsent.upsert({
    where: { userId },
    create: {
      userId,
      granted,
      policyVersion: AI_CONSENT_POLICY_VERSION,
      grantedAt: granted ? now : null,
      revokedAt: granted ? null : now,
    },
    update: {
      granted,
      policyVersion: AI_CONSENT_POLICY_VERSION,
      ...(granted ? { grantedAt: now, revokedAt: null } : { revokedAt: now }),
    },
    select: consentSelect,
  });
  return serializeConsent(consent);
}

export async function requireAiConsent(userId: string): Promise<boolean> {
  const consent = await prisma.aiConsent.findUnique({ where: { userId }, select: { granted: true } });
  return consent?.granted ?? false;
}
