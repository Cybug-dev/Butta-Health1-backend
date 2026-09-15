CREATE TYPE "AiExtractionStatus" AS ENUM (
    'DRAFTED',
    'FAILED',
    'REFUSED'
);

CREATE TABLE "AiConsent" (
    "id" UUID NOT NULL,
    "userId" UUID NOT NULL,
    "granted" BOOLEAN NOT NULL DEFAULT false,
    "policyVersion" VARCHAR(30) NOT NULL,
    "grantedAt" TIMESTAMPTZ(3),
    "revokedAt" TIMESTAMPTZ(3),
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,
    CONSTRAINT "AiConsent_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "AiExtraction" (
    "id" UUID NOT NULL,
    "userId" UUID NOT NULL,
    "healthEventId" UUID,
    "provider" VARCHAR(50) NOT NULL,
    "model" VARCHAR(100) NOT NULL,
    "promptVersion" VARCHAR(30) NOT NULL,
    "status" "AiExtractionStatus" NOT NULL,
    "inputPreview" VARCHAR(200) NOT NULL,
    "urgentFlag" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "AiExtraction_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "AiConsent_userId_key" ON "AiConsent"("userId");
CREATE INDEX "AiExtraction_userId_createdAt_idx" ON "AiExtraction"("userId", "createdAt" DESC);

ALTER TABLE "AiConsent" ADD CONSTRAINT "AiConsent_userId_fkey"
FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "AiExtraction" ADD CONSTRAINT "AiExtraction_userId_fkey"
FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
