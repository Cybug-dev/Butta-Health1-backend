-- CreateEnum
CREATE TYPE "AttachmentStatus" AS ENUM ('PENDING', 'ATTACHED');

-- CreateTable
CREATE TABLE "HealthEventAttachment" (
    "id" UUID NOT NULL,
    "userId" UUID NOT NULL,
    "healthEventId" UUID,
    "status" "AttachmentStatus" NOT NULL DEFAULT 'PENDING',
    "storageKey" VARCHAR(255) NOT NULL,
    "originalName" VARCHAR(255) NOT NULL,
    "mimeType" VARCHAR(100) NOT NULL,
    "sizeBytes" INTEGER NOT NULL,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "HealthEventAttachment_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "HealthEventAttachment_userId_createdAt_idx" ON "HealthEventAttachment"("userId", "createdAt" DESC);

-- CreateIndex
CREATE INDEX "HealthEventAttachment_healthEventId_idx" ON "HealthEventAttachment"("healthEventId");

-- AddForeignKey
ALTER TABLE "HealthEventAttachment" ADD CONSTRAINT "HealthEventAttachment_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "HealthEventAttachment" ADD CONSTRAINT "HealthEventAttachment_healthEventId_fkey" FOREIGN KEY ("healthEventId") REFERENCES "HealthEvent"("id") ON DELETE CASCADE ON UPDATE CASCADE;
