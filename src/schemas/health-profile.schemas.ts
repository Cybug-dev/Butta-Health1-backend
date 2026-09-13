import { z } from 'zod';

const nullableTrimmedString = (max: number) => z.string().trim().min(1).max(max).nullable().optional();
const healthItem = z.string().trim().min(1).max(200).regex(/^[^\p{Cc}]+$/u);
const healthItems = z.array(healthItem).max(100).transform((items) => [...new Set(items)]);

const dateOfBirth = z.iso.date().refine((value) => value <= new Date().toISOString().slice(0, 10), {
  message: 'Date of birth cannot be in the future.',
});

export const healthProfileSchema = z.strictObject({
  dateOfBirth: dateOfBirth.nullable().optional(),
  sex: nullableTrimmedString(50),
  bloodGroup: z.enum(['A+', 'A-', 'B+', 'B-', 'AB+', 'AB-', 'O+', 'O-']).nullable().optional(),
  allergies: healthItems,
  existingConditions: healthItems,
  currentMedications: healthItems,
  emergencyContactName: nullableTrimmedString(100),
  emergencyContactPhone: z.string().trim().min(7).max(30)
    .regex(/^\+?[0-9 ()-]+$/).nullable().optional(),
});

export type HealthProfileInput = z.infer<typeof healthProfileSchema>;
