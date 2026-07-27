import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";

// 削除(非活性化)済みの社員一覧。社員管理画面の「復活」用。管理者のみアクセス可(proxy.ts参照)。
export async function GET() {
  const employees = await prisma.employee.findMany({
    where: { isActive: false },
    orderBy: { updatedAt: "desc" },
    include: { currentStatus: true },
  });

  return NextResponse.json({ employees });
}
