// フェーズ2A 工程6: scripts/genba_master_draft.json (単価表86社分の整形済みデータ) を
// Client/Site/SitePrice へ初期登録するインポートスクリプト。
//
// 実行: npx tsx prisma/import-genba-master.ts
//
// 守るべき条件 (docs/08, ユーザー指示より):
// - scripts/price_data.json は読まない・変更しない (入力は genba_master_draft.json のみ)
// - 同じスクリプトを何度実行しても重複登録されない (SitePrice.notes の [genba-import row=N] タグで既存判定)
// - 要確認データは削除・推測修正せず needsReview/reviewReason で保持する
// - 単価として確定できない文字列は数値化せず notes/reviewReason に残す
// - 元データの行(index・元の表記)を notes に埋め込み、登録先データと突き合わせられるようにする
// - 既存の employees/status/status_history には一切触れない
// - 全体を1トランザクションで実行し、失敗時は何も残さない
//
// workCategory/orderCategory の扱い: 元データ(単価表)には業務区分の情報が一切ないため、
// ユーザー承認済みの方針により workCategory="SONOTA"(その他)・orderCategory="FUMEI"(不明) で
// 仮登録し、Site.needsReview=true で「要確認」として管理画面から後で修正できるようにする。

import * as fs from "node:fs";
import * as path from "node:path";
import { PrismaClient } from "../src/generated/prisma/client";
import { PrismaBetterSqlite3 } from "@prisma/adapter-better-sqlite3";

const adapter = new PrismaBetterSqlite3({
  url: process.env.DATABASE_URL ?? "file:./dev.db",
});
const prisma = new PrismaClient({ adapter });

const DRAFT_PATH = path.join(__dirname, "../../scripts/genba_master_draft.json");

type PriceStatus = "ok" | "empty" | "needs_review" | "memo_only";

type DraftRow = {
  index: number;
  rawName: string;
  baseName: string;
  vehicleOrRouteVariant: string | null;
  normalizedBaseName: string;
  dayPrice: number | null;
  dayPriceStatus: PriceStatus;
  dayPriceNote: string | null;
  nightPrice: number | null;
  nightPriceStatus: PriceStatus;
  nightPriceNote: string | null;
  otherPrice: number | null;
  otherPriceStatus: PriceStatus;
  otherPriceNote: string | null;
  overallStatus: "clean" | "needs_review" | "no_price_data";
};

type DraftFile = {
  summary: {
    total: number;
    clean: number;
    needsReview: number;
    noPriceData: number;
    multiRowCompanyGroups: number;
  };
  rows: DraftRow[];
};

// 「フェアロード経由」等、車種違いではなく別現場の可能性がある表記。
// 該当する行は同一取引先配下でも別 Site として登録し、要確認フラグを付ける。
const ROUTE_VARIANT_MARKERS = ["経由"];

function isRouteVariant(variant: string | null): boolean {
  if (!variant) return false;
  return ROUTE_VARIANT_MARKERS.some((marker) => variant.includes(marker));
}

function importRowTag(index: number): string {
  return `[genba-import row=${index}]`;
}

function fieldLabel(field: "day" | "night" | "other"): string {
  return field === "day" ? "昼" : field === "night" ? "夜" : "その他";
}

function buildPriceReviewReason(row: DraftRow): string | null {
  const parts: string[] = [];
  (["day", "night", "other"] as const).forEach((field) => {
    const status = row[`${field}PriceStatus`];
    const note = row[`${field}PriceNote`];
    if (status === "needs_review") {
      parts.push(
        `${fieldLabel(field)}単価欄に注記「${note}」が含まれていたため金額を抽出したが意味の確認が必要`
      );
    } else if (status === "memo_only") {
      parts.push(
        `${fieldLabel(field)}単価欄は電話メモ「${note}」のみで金額を抽出できず、単価は空欄のまま登録`
      );
    }
  });
  if (parts.length === 0) return null;
  return parts.join("／") + "(docs/05-price-data-analysis.md参照)";
}

function buildSitePriceNotes(row: DraftRow): string {
  return `${importRowTag(row.index)} 元データ表記="${row.rawName}"`;
}

const CATEGORY_REVIEW_REASON =
  "業務区分(workCategory)・発注区分(orderCategory)は元データ(単価表)に情報がないため、" +
  "業務区分=その他・発注区分=不明で仮登録。正しい区分に要修正。";

const FAIRROAD_ROUTE_REASON =
  "「フェアロード経由」の表記は車種違いではなく、山田建設興業経由でフェアロードの現場に入る" +
  "場合の単価とも読めるため、意味を確認できていない。仮に山田建設興業配下の別現場として登録" +
  "(docs/05-price-data-analysis.md参照)。";

type SiteBucket = {
  siteName: string;
  isRouteVariantSite: boolean;
  rows: DraftRow[];
};

function bucketRowsBySite(rows: DraftRow[], clientName: string): SiteBucket[] {
  const mainRows = rows.filter((r) => !isRouteVariant(r.vehicleOrRouteVariant));
  const routeRows = rows.filter((r) => isRouteVariant(r.vehicleOrRouteVariant));

  const buckets: SiteBucket[] = [];
  if (mainRows.length > 0) {
    buckets.push({ siteName: clientName, isRouteVariantSite: false, rows: mainRows });
  }
  for (const routeRow of routeRows) {
    buckets.push({
      siteName: `${clientName} ${routeRow.vehicleOrRouteVariant}`,
      isRouteVariantSite: true,
      rows: [routeRow],
    });
  }
  return buckets;
}

type ImportStats = {
  clientsCreated: number;
  clientsExisting: number;
  sitesCreated: number;
  sitesSkippedExisting: number;
  sitePricesCreated: number;
  sitePricesSkippedExisting: number;
  rowsProcessed: number[];
};

async function main() {
  if (!fs.existsSync(DRAFT_PATH)) {
    throw new Error(`入力ファイルが見つかりません: ${DRAFT_PATH}`);
  }
  const draft: DraftFile = JSON.parse(fs.readFileSync(DRAFT_PATH, "utf-8"));

  if (draft.rows.length !== 86) {
    throw new Error(
      `想定外の行数です(86件を想定、実際は${draft.rows.length}件)。データを確認してください。`
    );
  }

  // normalizedBaseName ごとにグループ化 (取引先の単位)
  const groups = new Map<string, DraftRow[]>();
  for (const row of draft.rows) {
    const key = row.normalizedBaseName;
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key)!.push(row);
  }

  const stats: ImportStats = {
    clientsCreated: 0,
    clientsExisting: 0,
    sitesCreated: 0,
    sitesSkippedExisting: 0,
    sitePricesCreated: 0,
    sitePricesSkippedExisting: 0,
    rowsProcessed: [],
  };

  await prisma.$transaction(async (tx) => {
    for (const [clientName, rows] of groups) {
      let client = await tx.client.findFirst({ where: { name: clientName } });
      if (client) {
        stats.clientsExisting++;
      } else {
        client = await tx.client.create({ data: { name: clientName } });
        stats.clientsCreated++;
      }

      const buckets = bucketRowsBySite(rows, clientName);

      for (const bucket of buckets) {
        let site = await tx.site.findFirst({
          where: { clientId: client.id, name: bucket.siteName },
        });

        if (!site) {
          const reviewReason = bucket.isRouteVariantSite
            ? `${CATEGORY_REVIEW_REASON}／${FAIRROAD_ROUTE_REASON}`
            : CATEGORY_REVIEW_REASON;
          const sourceRows = bucket.rows.map((r) => r.index).join(",");

          site = await tx.site.create({
            data: {
              clientId: client.id,
              name: bucket.siteName,
              workCategory: "SONOTA",
              orderCategory: "FUMEI",
              notes: `[genba-import client="${clientName}" sourceRows="${sourceRows}"]`,
              needsReview: true,
              reviewReason,
            },
          });
          stats.sitesCreated++;
        } else {
          stats.sitesSkippedExisting++;
        }

        for (const row of bucket.rows) {
          const tag = importRowTag(row.index);
          const existingPrice = await tx.sitePrice.findFirst({
            where: { siteId: site.id, notes: { contains: tag } },
          });

          if (existingPrice) {
            stats.sitePricesSkippedExisting++;
            stats.rowsProcessed.push(row.index);
            continue;
          }

          const vehicleType =
            row.vehicleOrRouteVariant && !isRouteVariant(row.vehicleOrRouteVariant)
              ? row.vehicleOrRouteVariant
              : null;
          const needsReview = row.overallStatus === "needs_review";
          const reviewReason = needsReview ? buildPriceReviewReason(row) : null;

          await tx.sitePrice.create({
            data: {
              siteId: site.id,
              vehicleType,
              dayPrice: row.dayPrice,
              nightPrice: row.nightPrice,
              otherPrice: row.otherPrice,
              notes: buildSitePriceNotes(row),
              needsReview,
              reviewReason,
            },
          });
          stats.sitePricesCreated++;
          stats.rowsProcessed.push(row.index);
        }
      }
    }
  });

  console.log("=== インポート結果 ===");
  console.log(`取引先: 新規作成 ${stats.clientsCreated} / 既存(スキップ) ${stats.clientsExisting}`);
  console.log(`現場: 新規作成 ${stats.sitesCreated} / 既存(スキップ) ${stats.sitesSkippedExisting}`);
  console.log(
    `車種別単価: 新規作成 ${stats.sitePricesCreated} / 既存(スキップ) ${stats.sitePricesSkippedExisting}`
  );
  console.log(`処理した元データ行数: ${stats.rowsProcessed.length} / 86`);

  const missing = draft.rows
    .map((r) => r.index)
    .filter((i) => !stats.rowsProcessed.includes(i));
  if (missing.length > 0) {
    console.log(`未処理の行 index: ${missing.join(",")}`);
  }
}

main()
  .then(async () => {
    await prisma.$disconnect();
  })
  .catch(async (e) => {
    console.error(e);
    await prisma.$disconnect();
    process.exit(1);
  });
