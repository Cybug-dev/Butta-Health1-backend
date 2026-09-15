ALTER TYPE "HealthEventType" ADD VALUE 'CHECK_IN';

CREATE TYPE "CheckInPromptType" AS ENUM (
    'FIRST_ENTRY',
    'DAILY_REFLECTION',
    'SYMPTOM_FOLLOW_UP',
    'MEDICATION_FOLLOW_UP'
);

CREATE TABLE "CheckIn" (
    "id" UUID NOT NULL,
    "userId" UUID NOT NULL,
    "promptType" "CheckInPromptType" NOT NULL,
    "promptText" VARCHAR(500) NOT NULL,
    "scheduledFor" DATE NOT NULL,
    "respondedAt" TIMESTAMPTZ(3),
    "healthEventId" UUID,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,
    CONSTRAINT "CheckIn_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "CheckIn_promptText_nonempty" CHECK (length(btrim("promptText")) > 0)
);

CREATE TABLE "NotificationPreference" (
    "id" UUID NOT NULL,
    "userId" UUID NOT NULL,
    "eventReminders" BOOLEAN NOT NULL DEFAULT true,
    "weeklySummary" BOOLEAN NOT NULL DEFAULT true,
    "dailyCheckIn" BOOLEAN NOT NULL DEFAULT true,
    "checkInTime" VARCHAR(5) NOT NULL DEFAULT '09:00',
    "timezone" VARCHAR(100) NOT NULL DEFAULT 'UTC',
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,
    CONSTRAINT "NotificationPreference_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "NotificationPreference_checkInTime_format" CHECK ("checkInTime" ~ '^([01][0-9]|2[0-3]):[0-5][0-9]$')
);

CREATE UNIQUE INDEX "CheckIn_healthEventId_key" ON "CheckIn"("healthEventId");
CREATE UNIQUE INDEX "CheckIn_userId_scheduledFor_key" ON "CheckIn"("userId", "scheduledFor");
CREATE INDEX "CheckIn_userId_scheduledFor_idx" ON "CheckIn"("userId", "scheduledFor" DESC);
CREATE UNIQUE INDEX "NotificationPreference_userId_key" ON "NotificationPreference"("userId");

INSERT INTO "NotificationPreference" ("id", "userId", "updatedAt")
SELECT gen_random_uuid(), "id", CURRENT_TIMESTAMP FROM "User";

ALTER TABLE "CheckIn" ADD CONSTRAINT "CheckIn_userId_fkey"
FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "CheckIn" ADD CONSTRAINT "CheckIn_healthEventId_fkey"
FOREIGN KEY ("healthEventId") REFERENCES "HealthEvent"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "NotificationPreference" ADD CONSTRAINT "NotificationPreference_userId_fkey"
FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
