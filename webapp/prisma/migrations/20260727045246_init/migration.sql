-- CreateTable
CREATE TABLE "statuses" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "label" TEXT NOT NULL,
    "color" TEXT NOT NULL,
    "sort_order" INTEGER NOT NULL
);

-- CreateTable
CREATE TABLE "employees" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "name" TEXT NOT NULL,
    "department" TEXT NOT NULL,
    "display_order" INTEGER NOT NULL,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "current_status_id" TEXT NOT NULL,
    "updated_at" DATETIME NOT NULL,
    CONSTRAINT "employees_current_status_id_fkey" FOREIGN KEY ("current_status_id") REFERENCES "statuses" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "status_history" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "employee_id" TEXT NOT NULL,
    "from_status_id" TEXT,
    "to_status_id" TEXT NOT NULL,
    "changed_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "status_history_employee_id_fkey" FOREIGN KEY ("employee_id") REFERENCES "employees" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "status_history_from_status_id_fkey" FOREIGN KEY ("from_status_id") REFERENCES "statuses" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "status_history_to_status_id_fkey" FOREIGN KEY ("to_status_id") REFERENCES "statuses" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);
