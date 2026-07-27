import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { Department } from "@/generated/prisma/enums";

const VALID_DEPARTMENTS: Department[] = ["DOBOKU", "UNYU"];

export async function PATCH(
  request: NextRequest,
  ctx: RouteContext<"/api/employees/[id]">
) {
  const { id } = await ctx.params;
  const body = await request.json();

  const data: { name?: string; homeDepartment?: Department; currentDepartment?: Department } = {};

  if (body?.name !== undefined) {
    const name = typeof body.name === "string" ? body.name.trim() : "";
    if (name.length === 0) {
      return NextResponse.json({ error: "name must not be empty" }, { status: 400 });
    }
    data.name = name;
  }

  if (body?.department !== undefined) {
    if (!VALID_DEPARTMENTS.includes(body.department)) {
      return NextResponse.json({ error: "invalid department" }, { status: 400 });
    }
    // 社員管理画面での「所属」編集は、本来の所属・当日の配置を同時に揃える
    data.homeDepartment = body.department;
    data.currentDepartment = body.department;
  }

  const employee = await prisma.employee.findUnique({ where: { id } });
  if (!employee) {
    return NextResponse.json({ error: "employee not found" }, { status: 404 });
  }

  const updated = await prisma.employee.update({
    where: { id },
    data,
    include: { currentStatus: true },
  });

  return NextResponse.json({ employee: updated });
}

export async function DELETE(
  _request: NextRequest,
  ctx: RouteContext<"/api/employees/[id]">
) {
  const { id } = await ctx.params;

  const employee = await prisma.employee.findUnique({ where: { id } });
  if (!employee) {
    return NextResponse.json({ error: "employee not found" }, { status: 404 });
  }

  await prisma.employee.update({
    where: { id },
    data: { isActive: false },
  });

  return NextResponse.json({ ok: true });
}
