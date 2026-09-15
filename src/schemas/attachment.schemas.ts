import { z } from 'zod';

export const attachmentIdSchema = z.uuid();

export const attachHealthEventSchema = z.strictObject({
  attachmentIds: z.array(z.uuid()).min(1).max(6),
});

export type AttachHealthEventInput = z.infer<typeof attachHealthEventSchema>;
