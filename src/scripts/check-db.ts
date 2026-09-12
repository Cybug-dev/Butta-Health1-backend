async function checkDatabase() {
  const { default: env } = await import('../config/env.js');
  const { PrismaClient } = await import('../generated/prisma/client.js');
  const { PrismaPg } = await import('@prisma/adapter-pg');

  const adapter = new PrismaPg({
    connectionString: env.DATABASE_URL,
    connectionTimeoutMillis: 10_000,
    query_timeout: 10_000,
  });
  const prisma = new PrismaClient({ adapter, log: [] });

  try {
    const result = await prisma.$queryRaw<Array<{ ok: number }>>`SELECT 1 AS ok`;
    if (result[0]?.ok !== 1) throw new Error('Unexpected database response');
    console.log('Database connectivity verified with a read-only SELECT 1.');
  } finally {
    await prisma.$disconnect();
  }
}

checkDatabase().catch((error: unknown) => {
  console.error(error instanceof Error && 'code' in error && error.code === 'ENV_CONFIG'
    ? error.message
    : 'Database verification failed. Check DATABASE_URL, network access, and Prisma Client generation.');
  process.exitCode = 1;
});
