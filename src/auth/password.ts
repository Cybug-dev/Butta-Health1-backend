import { randomBytes } from 'node:crypto';
import { argon2id, hash, verify } from 'argon2';

const options = { type: argon2id, memoryCost: 19456, timeCost: 2, parallelism: 1 } as const;

export function hashPassword(password: string) {
  return hash(password, options);
}

// Unknown users still perform an Argon2 verification, reducing timing differences.
const dummyHash = await hashPassword(randomBytes(32).toString('hex'));

export async function verifyPassword(passwordHash: string | null, password: string) {
  const matches = await verify(passwordHash ?? dummyHash, password);
  return passwordHash !== null && matches;
}
