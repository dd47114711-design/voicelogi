import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";

export async function GET() {
  const [employees, statuses] = await Promise.all([
    prisma.employee.findMany({
      where: { isActive: true },
      orderBy: { displayOrder: "asc" },
      include: { currentStatus: true },
    }),
    prisma.status.findMany({ orderBy: { sortOrder: "asc" } }),
  ]);

  return NextResponse.json({ employees, statuses });
}
