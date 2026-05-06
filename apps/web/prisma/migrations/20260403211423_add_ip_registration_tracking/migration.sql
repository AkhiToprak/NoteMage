-- CreateTable
CREATE TABLE "ip_registrations" (
    "id" TEXT NOT NULL,
    "ip" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ip_registrations_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "ip_registrations_ip_createdAt_idx" ON "ip_registrations"("ip", "createdAt");
