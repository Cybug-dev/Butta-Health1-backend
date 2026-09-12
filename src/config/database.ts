import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '../generated/prisma/client.js';
import env from './env.js';

const adapter = new PrismaPg({
  connectionString: env.DATABASE_URL,
  connectionTimeoutMillis: 10_000,
  query_timeout: 10_000,
  max: 5,
});

export const prisma = new PrismaClient({ adapter, log: [] });
