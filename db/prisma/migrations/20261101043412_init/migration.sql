-- CreateTable
CREATE TABLE "User" (
    "telegramId" TEXT NOT NULL,
    "chatId" TEXT,
    "lat" DOUBLE PRECISION,
    "lng" DOUBLE PRECISION,
    "locationAt" TIMESTAMP(3),
    "notify" BOOLEAN NOT NULL DEFAULT true,
    "lastNudgeAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "User_pkey" PRIMARY KEY ("telegramId")
);

-- CreateTable
CREATE TABLE "Link" (
    "telegramId" TEXT NOT NULL,
    "address" TEXT NOT NULL,
    "linkedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Link_pkey" PRIMARY KEY ("telegramId")
);

-- CreateTable
CREATE TABLE "Nonce" (
    "telegramId" TEXT NOT NULL,
    "nonce" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Nonce_pkey" PRIMARY KEY ("telegramId")
);

-- CreateTable
CREATE TABLE "Topup" (
    "address" TEXT NOT NULL,
    "amountWei" BIGINT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Topup_pkey" PRIMARY KEY ("address")
);

-- CreateTable
CREATE TABLE "Task" (
    "id" SERIAL NOT NULL,
    "bountyId" INTEGER,
    "kind" TEXT NOT NULL DEFAULT 'price',
    "title" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "item" TEXT,
    "unit" TEXT,
    "currency" TEXT NOT NULL DEFAULT 'NGN',
    "marketName" TEXT,
    "city" TEXT,
    "lat" DOUBLE PRECISION NOT NULL,
    "lng" DOUBLE PRECISION NOT NULL,
    "radiusM" INTEGER NOT NULL DEFAULT 5000,
    "specHash" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Task_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Blob" (
    "hash" TEXT NOT NULL,
    "bytes" BYTEA NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Blob_pkey" PRIMARY KEY ("hash")
);

-- CreateTable
CREATE TABLE "Claim" (
    "bountyId" INTEGER NOT NULL,
    "address" TEXT NOT NULL,
    "telegramId" TEXT NOT NULL,
    "state" TEXT NOT NULL DEFAULT 'claimed',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Claim_pkey" PRIMARY KEY ("bountyId","address")
);

-- CreateIndex
CREATE UNIQUE INDEX "Link_address_key" ON "Link"("address");

-- CreateIndex
CREATE INDEX "Topup_createdAt_idx" ON "Topup"("createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "Task_bountyId_key" ON "Task"("bountyId");

-- CreateIndex
CREATE UNIQUE INDEX "Task_specHash_key" ON "Task"("specHash");

-- CreateIndex
CREATE INDEX "Task_lat_lng_idx" ON "Task"("lat", "lng");

-- CreateIndex
CREATE INDEX "Claim_telegramId_idx" ON "Claim"("telegramId");
