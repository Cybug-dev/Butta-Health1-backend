BEGIN;

CREATE SCHEMA IF NOT EXISTS "public";

CREATE TYPE "AuthProvider" AS ENUM ('LOCAL', 'GOOGLE');

CREATE TABLE "User" (
    "id" UUID NOT NULL,
    "email" VARCHAR(254) NOT NULL,
    "firstName" VARCHAR(100) NOT NULL,
    "lastName" VARCHAR(100) NOT NULL,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,
    CONSTRAINT "User_pkey" PRIMARY KEY ("id"),
    -- Prisma does not yet represent CHECK constraints in schema.prisma.
    CONSTRAINT "User_email_normalized" CHECK ("email" = lower(btrim("email")) AND "email" <> '')
);

CREATE TABLE "AuthAccount" (
    "id" UUID NOT NULL,
    "userId" UUID NOT NULL,
    "provider" "AuthProvider" NOT NULL,
    "providerAccountId" VARCHAR(255),
    "passwordHash" TEXT,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,
    CONSTRAINT "AuthAccount_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "AuthAccount_credentials_shape" CHECK (
      ("provider" = 'LOCAL' AND "providerAccountId" IS NULL
        AND "passwordHash" IS NOT NULL AND "passwordHash" LIKE '$argon2id$%')
      OR
      ("provider" = 'GOOGLE' AND "providerAccountId" IS NOT NULL
        AND length(btrim("providerAccountId")) > 0 AND "passwordHash" IS NULL)
    )
);

CREATE UNIQUE INDEX "User_email_key" ON "User"("email");
-- The leading userId also supports relation lookups and cascading deletes.
CREATE UNIQUE INDEX "AuthAccount_userId_provider_key" ON "AuthAccount"("userId", "provider");
CREATE UNIQUE INDEX "AuthAccount_provider_providerAccountId_key" ON "AuthAccount"("provider", "providerAccountId");

ALTER TABLE "AuthAccount" ADD CONSTRAINT "AuthAccount_userId_fkey"
FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

COMMIT;
