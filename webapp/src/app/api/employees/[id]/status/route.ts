import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";

export async function PATCH(
  request: NextRequest,
  ctx: RouteContext<"/api/employees/[id]/status">
) {
  const { id } = await ctx.params;
  const body = await request.json();
  const statusId = body?.statusId;

  if (typeof statusId !== "string" || statusId.length === 0) {
    return NextResponse.json({ error: "statusId is required" }, { status: 400 });
  }

  const employee = await prisma.employee.findUnique({ where: { id } });
  if (!employee) {
    return NextResponse.json({ error: "employee not found" }, { status: 404 });
  }

  const status = await prisma.status.findUnique({ where: { id: statusId } });
  if (!status) {
    return NextResponse.json({ error: "status not found" }, { status: 400 });
  }

  const updated = await prisma.$transaction(async (tx) => {
    const result = await tx.employee.update({
      where: { id },
      data: { currentStatusId: statusId },
      include: { currentStatus: true },
    });

    await tx.statusHistory.create({
      data: {
        employeeId: id,
        fromStatusId: employee.currentStatusId,
        toStatusId: statusId,
      },
    });

    return result;
  });

  return NextResponse.json({ employee: updated });
}
