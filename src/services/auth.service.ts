import { Prisma } from '../generated/prisma/client.js';
import { prisma } from '../config/database.js';
import { hashPassword, verifyPassword } from '../auth/password.js';
import { AuthError, unauthorized } from '../auth/errors.js';
import type { RegisterInput, LoginInput } from '../schemas/auth.schemas.js';

const safeUserSelect = {
  id: true, email: true, firstName: true, lastName: true, createdAt: true, updatedAt: true,
} satisfies Prisma.UserSelect;

export async function registerUser(input: RegisterInput) {
  const passwordHash = await hashPassword(input.password);
  try {
    // A nested write is one transaction: neither row survives if either insert fails.
    return await prisma.user.create({
      data: {
        email: input.email, firstName: input.firstName, lastName: input.lastName,
        authAccounts: { create: { provider: 'LOCAL', passwordHash } },
        notificationPreference: { create: {} },
      },
      select: safeUserSelect,
    });
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
      throw new AuthError(409, 'REGISTRATION_CONFLICT', 'Unable to register with these details.');
    }
    throw error;
  }
}

export async function loginUser(input: LoginInput) {
  const user = await prisma.user.findUnique({
    where: { email: input.email },
    select: {
      ...safeUserSelect,
      authAccounts: { where: { provider: 'LOCAL' }, select: { passwordHash: true } },
    },
  });
  const valid = await verifyPassword(user?.authAccounts[0]?.passwordHash ?? null, input.password);
  if (!valid || !user) {
    throw new AuthError(401, 'INVALID_CREDENTIALS', 'Invalid email or password.');
  }
  const { authAccounts: _accounts, ...safeUser } = user;
  return safeUser;
}

export async function currentUser(userId: string) {
  const user = await prisma.user.findUnique({ where: { id: userId }, select: safeUserSelect });
  if (!user) throw unauthorized();
  return user;
}
