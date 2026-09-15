import { z } from 'zod';

export const AI_CONSENT_POLICY_VERSION = '2026-09-15';

export const aiConsentInputSchema = z.strictObject({
  granted: z.boolean(),
});

export type AiConsentInput = z.infer<typeof aiConsentInputSchema>;
