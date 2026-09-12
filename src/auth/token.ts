import { SignJWT, jwtVerify } from 'jose';
import { z } from 'zod';
import env from '../config/env.js';

const key = Buffer.from(env.JWT_SECRET, 'hex');
const issuer = 'butta-health';
const audience = 'butta-health-client';

export function createAuthToken(userId: string) {
  const issuedAt = Math.floor(Date.now() / 1000);
  return new SignJWT({})
    .setProtectedHeader({ alg: 'HS256', typ: 'JWT' })
    .setSubject(userId)
    .setIssuer(issuer)
    .setAudience(audience)
    .setIssuedAt(issuedAt)
    .setExpirationTime(issuedAt + env.JWT_EXPIRES_IN_SECONDS)
    .sign(key);
}

export async function verifyAuthToken(token: string): Promise<string> {
  const { payload } = await jwtVerify(token, key, {
    algorithms: ['HS256'], issuer, audience, typ: 'JWT',
    requiredClaims: ['sub', 'iat', 'exp'],
    maxTokenAge: env.JWT_EXPIRES_IN_SECONDS,
  });
  return z.uuid().parse(payload.sub);
}
