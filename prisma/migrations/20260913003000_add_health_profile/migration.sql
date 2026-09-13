CREATE TABLE "HealthProfile" (
    "id" UUID NOT NULL,
    "userId" UUID NOT NULL,
    "dateOfBirth" DATE,
    "sex" VARCHAR(50),
    "bloodGroup" VARCHAR(3),
    "allergies" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
    "existingConditions" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
    "currentMedications" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
    "emergencyContactName" VARCHAR(100),
    "emergencyContactPhone" VARCHAR(30),
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "HealthProfile_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "HealthProfile_bloodGroup_check" CHECK (
      "bloodGroup" IS NULL OR "bloodGroup" IN ('A+', 'A-', 'B+', 'B-', 'AB+', 'AB-', 'O+', 'O-')
    )
);

CREATE UNIQUE INDEX "HealthProfile_userId_key" ON "HealthProfile"("userId");

ALTER TABLE "HealthProfile"
ADD CONSTRAINT "HealthProfile_userId_fkey"
FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
