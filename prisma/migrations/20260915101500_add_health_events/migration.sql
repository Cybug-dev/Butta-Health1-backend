CREATE TYPE "HealthEventType" AS ENUM ('SYMPTOM', 'MEDICATION', 'DIGESTIVE', 'DOCTOR_VISIT');
CREATE TYPE "HealthEventSeverity" AS ENUM ('MILD', 'MODERATE', 'SEVERE', 'NOT_SPECIFIED');
CREATE TYPE "HealthEventSource" AS ENUM ('TYPED', 'VOICE', 'PRESET');
CREATE TYPE "HealthEventStatus" AS ENUM ('CONFIRMED', 'NEEDS_MONITORING', 'PREPARED');

CREATE TABLE "HealthEvent" (
    "id" UUID NOT NULL,
    "userId" UUID NOT NULL,
    "type" "HealthEventType" NOT NULL,
    "title" VARCHAR(160) NOT NULL,
    "occurredAt" TIMESTAMPTZ(3) NOT NULL,
    "severity" "HealthEventSeverity" NOT NULL DEFAULT 'NOT_SPECIFIED',
    "symptoms" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
    "treatment" VARCHAR(2000) NOT NULL DEFAULT '',
    "notes" VARCHAR(5000) NOT NULL,
    "source" "HealthEventSource" NOT NULL,
    "status" "HealthEventStatus" NOT NULL DEFAULT 'CONFIRMED',
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "HealthEvent_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "HealthEvent_title_nonempty" CHECK (length(btrim("title")) > 0),
    CONSTRAINT "HealthEvent_notes_nonempty" CHECK (length(btrim("notes")) > 0)
);

CREATE INDEX "HealthEvent_userId_occurredAt_id_idx"
ON "HealthEvent"("userId", "occurredAt" DESC, "id");

CREATE INDEX "HealthEvent_userId_type_occurredAt_idx"
ON "HealthEvent"("userId", "type", "occurredAt" DESC);

ALTER TABLE "HealthEvent"
ADD CONSTRAINT "HealthEvent_userId_fkey"
FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
