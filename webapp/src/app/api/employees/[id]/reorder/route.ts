import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";

export async function PATCH(
  request: NextRequest,
  ctx: RouteContext<"/api/employees/[id]/reorder">
) {
  const { id } = await ctx.params;
  const body = await request.json();
  const direction = body?.direction;

  if (direction !== "up" && direction !== "down") {
    return NextResponse.json({ error: "direction must be 'up' or 'down'" }, { status: 400 });
  }

  const target = await prisma.employee.findUnique({ where: { id } });
  if (!target || !target.isActive) {
    return NextResponse.json({ error: "employee not found" }, { status: 404 });
  }

  // 同じ部門(currentDepartment)内で、表示順が1つ上/下の相手を探して入れ替える
  const neighbor = await prisma.employee.findFirst({
    where: {
      isActive: true,
      currentDepartment: target.currentDepartment,
      displayOrder: direction === "up" ? { lt: target.displayOrder } : { gt: target.displayOrder },
    },
    orderBy: { displayOrder: direction === "up" ? "desc" : "asc" },
  });

  if (!neighbor) {
    // 既に先頭/末尾なので何もしない
    return NextResponse.json({ ok: true, moved: false });
  }

  await prisma.$transaction([
    prisma.employee.update({
      where: { id: target.id },
      data: { displayOrder: neighbor.displayOrder },
    }),
    prisma.employee.update({
      where: { id: neighbor.id },
      data: { displayOrder: target.displayOrder },
    }),
  ]);

  return NextResponse.json({ ok: true, moved: true });
}
