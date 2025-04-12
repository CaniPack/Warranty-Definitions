-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_WarrantyDefinition" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "name" TEXT NOT NULL,
    "durationMonths" INTEGER NOT NULL,
    "priceType" TEXT NOT NULL,
    "priceValue" REAL NOT NULL,
    "description" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    "associationType" TEXT NOT NULL DEFAULT 'ALL_PRODUCTS',
    "associatedProductIds" TEXT NOT NULL DEFAULT '[]',
    "associatedCollectionIds" TEXT NOT NULL DEFAULT '[]'
);
INSERT INTO "new_WarrantyDefinition" ("createdAt", "description", "durationMonths", "id", "name", "priceType", "priceValue", "updatedAt") SELECT "createdAt", "description", "durationMonths", "id", "name", "priceType", "priceValue", "updatedAt" FROM "WarrantyDefinition";
DROP TABLE "WarrantyDefinition";
ALTER TABLE "new_WarrantyDefinition" RENAME TO "WarrantyDefinition";
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;
