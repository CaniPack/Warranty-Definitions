-- CreateTable
CREATE TABLE "WarrantyDefinition" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "name" TEXT NOT NULL,
    "durationMonths" INTEGER NOT NULL,
    "priceType" TEXT NOT NULL,
    "priceValue" REAL NOT NULL,
    "description" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);

-- CreateTable
CREATE TABLE "WarrantyProduct" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "shopifyProductId" TEXT NOT NULL,
    "shopifyVariantId" TEXT NOT NULL,
    "calculatedPrice" REAL NOT NULL,
    "durationMonths" INTEGER NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);

-- CreateTable
CREATE TABLE "ProductAssociation" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "warrantyDefinitionId" INTEGER NOT NULL,
    "shopifyResourceId" TEXT NOT NULL,
    "resourceType" TEXT NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "ProductAssociation_warrantyDefinitionId_fkey" FOREIGN KEY ("warrantyDefinitionId") REFERENCES "WarrantyDefinition" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateIndex
CREATE UNIQUE INDEX "WarrantyProduct_shopifyVariantId_key" ON "WarrantyProduct"("shopifyVariantId");

-- CreateIndex
CREATE UNIQUE INDEX "ProductAssociation_warrantyDefinitionId_shopifyResourceId_key" ON "ProductAssociation"("warrantyDefinitionId", "shopifyResourceId");
