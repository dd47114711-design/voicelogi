/*
  Warnings:

  - You are about to drop the column `department` on the `employees` table. All the data in the column will be lost.
  - Added the required column `current_department` to the `employees` table without a default value. This is not possible if the table is not empty.
  - Added the required column `home_department` to the `employees` table without a default value. This is not possible if the table is not empty.

*/
-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_employees" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "name" TEXT NOT NULL,
    "home_department" TEXT NOT NULL,
    "current_department" TEXT NOT NULL,
    "display_order" INTEGER NOT NULL,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "current_status_id" TEXT NOT NULL,
    "updated_at" DATETIME NOT NULL,
    CONSTRAINT "employees_current_status_id_fkey" FOREIGN KEY ("current_status_id") REFERENCES "statuses" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);
INSERT INTO "new_employees" ("current_status_id", "display_order", "id", "is_active", "name", "updated_at") SELECT "current_status_id", "display_order", "id", "is_active", "name", "updated_at" FROM "employees";
DROP TABLE "employees";
ALTER TABLE "new_employees" RENAME TO "employees";
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;
