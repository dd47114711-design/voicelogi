import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";

export async function PATCH(
  _request: NextRequest,
  ctx: RouteContext<"/api/employees/[id]/restore">
) {
  const { id } = await ctx.params;

  const employee = await prisma.employee.findUnique({ where: { id } });
  if (!employee) {
    return NextResponse.json({ error: "employee not found" }, { status: 404 });
  }

  const updated = await prisma.employee.update({
    where: { id },
    data: { isActive: true },
    include: { currentStatus: true },
  });

  return NextResponse.json({ employee: updated });
}
