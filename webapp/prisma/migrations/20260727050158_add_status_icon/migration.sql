-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_statuses" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "label" TEXT NOT NULL,
    "color" TEXT NOT NULL,
    "icon" TEXT NOT NULL DEFAULT '⚪',
    "sort_order" INTEGER NOT NULL
);
INSERT INTO "new_statuses" ("color", "id", "label", "sort_order") SELECT "color", "id", "label", "sort_order" FROM "statuses";
DROP TABLE "statuses";
ALTER TABLE "new_statuses" RENAME TO "statuses";
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;
