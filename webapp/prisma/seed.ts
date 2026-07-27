import { PrismaClient } from "../src/generated/prisma/client";
import { PrismaBetterSqlite3 } from "@prisma/adapter-better-sqlite3";

const adapter = new PrismaBetterSqlite3({
  url: process.env.DATABASE_URL ?? "file:./dev.db",
});
const prisma = new PrismaClient({ adapter });

const STATUSES = [
  { id: "shukkin", label: "出勤", color: "#FFFFFF", icon: "⚪", sortOrder: 1 },
  { id: "genba", label: "現場", color: "#3B82F6", icon: "🔵", sortOrder: 2 },
  { id: "kuusha", label: "空車", color: "#22C55E", icon: "🟢", sortOrder: 3 },
  { id: "yasumi", label: "休み", color: "#EF4444", icon: "🔴", sortOrder: 4 },
  { id: "sonota", label: "その他", color: "#9CA3AF", icon: "⚫", sortOrder: 5 },
] as const;

// 出欠札ボードの写真から読み取った氏名・部門・並び順。
// 誤読の可能性があるため、実運用前に必ず現場で名前を確認・修正すること。
const EMPLOYEES: { name: string; department: "DOBOKU" | "UNYU" }[] = [
  // 1段目: 土木部門
  { name: "渡邊啓一", department: "DOBOKU" },
  { name: "黒瀬裕大観", department: "DOBOKU" },
  { name: "川脇諒", department: "DOBOKU" },
  { name: "桒野修平", department: "DOBOKU" },
  { name: "小野一世", department: "DOBOKU" },
  { name: "村田広実", department: "DOBOKU" },
  { name: "垣﨑和幸", department: "DOBOKU" },

  // 2段目〜5段目: 運輸部門（ドライバー）
  { name: "土屋博正", department: "UNYU" },
  { name: "長野進", department: "UNYU" },
  { name: "木戸伸也", department: "UNYU" },
  { name: "森元義紀", department: "UNYU" },

  { name: "安達利博", department: "UNYU" },
  { name: "池田賢司", department: "UNYU" },
  { name: "杉尾浩志", department: "UNYU" },
  { name: "大迫博起", department: "UNYU" },

  { name: "冨永浩", department: "UNYU" },
  { name: "木本福介", department: "UNYU" },
  { name: "黒瀬大祐", department: "UNYU" },
  { name: "黒瀬優貴", department: "UNYU" },
  { name: "松本健太郎", department: "UNYU" },

  { name: "栢原勲", department: "UNYU" },
  { name: "三浦孝", department: "UNYU" },
  { name: "網分直臣", department: "UNYU" },
  { name: "恵良誠", department: "UNYU" },
  { name: "原田隆幸", department: "UNYU" },
  { name: "荒瀬弘章", department: "UNYU" },
  { name: "笹林武弘", department: "UNYU" },

  // 最下段: 本日休み(赤札)だった人たち
  { name: "黒瀬隆", department: "UNYU" },
  { name: "黒瀬冨弘龍", department: "UNYU" },
  { name: "黒瀬剛", department: "UNYU" },
  { name: "秋山英行", department: "UNYU" },
  { name: "水口経光", department: "UNYU" },
];

async function main() {
  for (const status of STATUSES) {
    await prisma.status.upsert({
      where: { id: status.id },
      update: {
        label: status.label,
        color: status.color,
        icon: status.icon,
        sortOrder: status.sortOrder,
      },
      create: status,
    });
  }

  for (let i = 0; i < EMPLOYEES.length; i++) {
    const employee = EMPLOYEES[i];
    await prisma.employee.upsert({
      where: { id: `seed-${i}` },
      update: {},
      create: {
        id: `seed-${i}`,
        name: employee.name,
        homeDepartment: employee.department,
        currentDepartment: employee.department,
        displayOrder: i,
        currentStatusId: "shukkin",
      },
    });
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
