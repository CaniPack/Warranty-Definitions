/*
  Warnings:

  - You are about to drop the column `priceType` on the `WarrantyDefinition` table. All the data in the column will be lost.
  - You are about to drop the column `priceValue` on the `WarrantyDefinition` table. All the data in the column will be lost.
  - Added the required column `price` to the `WarrantyDefinition` table without a default value. This is not possible if the table is not empty.

*/
-- CreateTable
CREATE TABLE "Product" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "shopifyId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "imageUrl" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);

-- CreateTable
CREATE TABLE "Collection" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "shopifyId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "imageUrl" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);

-- CreateTable
CREATE TABLE "_ProductToWarrantyDefinition" (
    "A" INTEGER NOT NULL,
    "B" INTEGER NOT NULL,
    CONSTRAINT "_ProductToWarrantyDefinition_A_fkey" FOREIGN KEY ("A") REFERENCES "Product" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "_ProductToWarrantyDefinition_B_fkey" FOREIGN KEY ("B") REFERENCES "WarrantyDefinition" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "_CollectionToWarrantyDefinition" (
    "A" INTEGER NOT NULL,
    "B" INTEGER NOT NULL,
    CONSTRAINT "_CollectionToWarrantyDefinition_A_fkey" FOREIGN KEY ("A") REFERENCES "Collection" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "_CollectionToWarrantyDefinition_B_fkey" FOREIGN KEY ("B") REFERENCES "WarrantyDefinition" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_WarrantyDefinition" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "name" TEXT NOT NULL,
    "durationMonths" INTEGER NOT NULL,
    "price" REAL NOT NULL DEFAULT 9.99,
    "description" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    "associationType" TEXT NOT NULL DEFAULT 'ALL_PRODUCTS',
    "associatedProductIds" TEXT NOT NULL DEFAULT '[]',
    "associatedCollectionIds" TEXT NOT NULL DEFAULT '[]'
);
INSERT INTO "new_WarrantyDefinition" ("associatedCollectionIds", "associatedProductIds", "associationType", "createdAt", "description", "durationMonths", "id", "name", "updatedAt") SELECT "associatedCollectionIds", "associatedProductIds", "associationType", "createdAt", "description", "durationMonths", "id", "name", "updatedAt" FROM "WarrantyDefinition";
DROP TABLE "WarrantyDefinition";
ALTER TABLE "new_WarrantyDefinition" RENAME TO "WarrantyDefinition";
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;

-- CreateIndex
CREATE UNIQUE INDEX "Product_shopifyId_key" ON "Product"("shopifyId");

-- CreateIndex
CREATE UNIQUE INDEX "Collection_shopifyId_key" ON "Collection"("shopifyId");

-- CreateIndex
CREATE UNIQUE INDEX "_ProductToWarrantyDefinition_AB_unique" ON "_ProductToWarrantyDefinition"("A", "B");

-- CreateIndex
CREATE INDEX "_ProductToWarrantyDefinition_B_index" ON "_ProductToWarrantyDefinition"("B");

-- CreateIndex
CREATE UNIQUE INDEX "_CollectionToWarrantyDefinition_AB_unique" ON "_CollectionToWarrantyDefinition"("A", "B");

-- CreateIndex
CREATE INDEX "_CollectionToWarrantyDefinition_B_index" ON "_CollectionToWarrantyDefinition"("B");
