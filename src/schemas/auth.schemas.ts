import { z } from 'zod';

const email = z.string().trim().toLowerCase().pipe(z.email().max(254));
const name = z.string().trim().min(1).max(100).regex(/^[^\p{Cc}]+$/u);

export const registerSchema = z.strictObject({
  firstName: name,
  lastName: name,
  email,
  password: z.string().min(8).max(128),
});

export const loginSchema = z.strictObject({
  email,
  password: z.string().min(1).max(128),
});

export type RegisterInput = z.infer<typeof registerSchema>;
export type LoginInput = z.infer<typeof loginSchema>;
