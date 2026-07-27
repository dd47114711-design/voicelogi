-- CreateTable
CREATE TABLE "clients" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "name" TEXT NOT NULL,
    "is_active" BOOLEAN NOT NULL DEFAULT true
);

-- CreateTable
CREATE TABLE "sites" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "client_id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "work_category" TEXT NOT NULL,
    "order_category" TEXT NOT NULL,
    "notes" TEXT,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "needs_review" BOOLEAN NOT NULL DEFAULT false,
    "review_reason" TEXT,
    "reviewed_at" DATETIME,
    CONSTRAINT "sites_client_id_fkey" FOREIGN KEY ("client_id") REFERENCES "clients" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "site_prices" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "site_id" TEXT NOT NULL,
    "vehicle_type" TEXT,
    "day_price" INTEGER,
    "night_price" INTEGER,
    "other_price" INTEGER,
    "valid_from" DATETIME,
    "valid_to" DATETIME,
    "notes" TEXT,
    "needs_review" BOOLEAN NOT NULL DEFAULT false,
    "review_reason" TEXT,
    "reviewed_at" DATETIME,
    CONSTRAINT "site_prices_site_id_fkey" FOREIGN KEY ("site_id") REFERENCES "sites" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);
