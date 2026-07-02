-- CreateTable
CREATE TABLE "Portal" (
    "id" TEXT NOT NULL,
    "portalId" TEXT NOT NULL,
    "accessToken" TEXT,
    "refreshToken" TEXT,
    "expiresAt" TIMESTAMP(3),
    "hubId" TEXT,
    "installedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Portal_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "settings" (
    "id" TEXT NOT NULL,
    "portalId" TEXT NOT NULL,
    "ticketWeight" INTEGER NOT NULL DEFAULT 25,
    "meetingWeight" INTEGER NOT NULL DEFAULT 20,
    "engagementWeight" INTEGER NOT NULL DEFAULT 20,
    "renewalWeight" INTEGER NOT NULL DEFAULT 25,
    "dealWeight" INTEGER NOT NULL DEFAULT 10,
    "renewalPipelineId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "settings_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "company_health" (
    "id" TEXT NOT NULL,
    "portalId" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "companyName" TEXT,
    "score" INTEGER NOT NULL DEFAULT 100,
    "riskLevel" TEXT NOT NULL DEFAULT 'healthy',
    "renewalDate" TIMESTAMP(3),
    "trend" INTEGER NOT NULL DEFAULT 0,
    "lastCalculatedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "company_health_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "health_history" (
    "id" TEXT NOT NULL,
    "companyHealthId" TEXT NOT NULL,
    "previousScore" INTEGER NOT NULL,
    "newScore" INTEGER NOT NULL,
    "reason" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "health_history_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "webhook_events" (
    "id" TEXT NOT NULL,
    "portalId" TEXT,
    "eventType" TEXT NOT NULL,
    "objectType" TEXT NOT NULL,
    "objectId" TEXT NOT NULL,
    "processed" BOOLEAN NOT NULL DEFAULT false,
    "payload" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "webhook_events_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Portal_portalId_key" ON "Portal"("portalId");

-- CreateIndex
CREATE UNIQUE INDEX "settings_portalId_key" ON "settings"("portalId");

-- CreateIndex
CREATE UNIQUE INDEX "company_health_portalId_companyId_key" ON "company_health"("portalId", "companyId");

-- AddForeignKey
ALTER TABLE "settings" ADD CONSTRAINT "settings_portalId_fkey" FOREIGN KEY ("portalId") REFERENCES "Portal"("portalId") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "company_health" ADD CONSTRAINT "company_health_portalId_fkey" FOREIGN KEY ("portalId") REFERENCES "Portal"("portalId") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "health_history" ADD CONSTRAINT "health_history_companyHealthId_fkey" FOREIGN KEY ("companyHealthId") REFERENCES "company_health"("id") ON DELETE CASCADE ON UPDATE CASCADE;
