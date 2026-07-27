import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { Department } from "@/generated/prisma/enums";

const VALID_DEPARTMENTS: Department[] = ["DOBOKU", "UNYU"];

// 「応援」用のエンドポイント。home_department(本来の所属)は変えずに、
// current_department(当日ボードに表示する部門)だけを切り替える。
// department を省略すると home_department に戻す(応援解除)。
export async function PATCH(
  request: NextRequest,
  ctx: RouteContext<"/api/employees/[id]/current-department">
) {
  const { id } = await ctx.params;
  const body = await request.json().catch(() => ({}));
  const department = body?.department;

  const employee = await prisma.employee.findUnique({ where: { id } });
  if (!employee) {
    return NextResponse.json({ error: "employee not found" }, { status: 404 });
  }

  let currentDepartment: Department;
  if (department === null || department === undefined) {
    currentDepartment = employee.homeDepartment;
  } else if (VALID_DEPARTMENTS.includes(department)) {
    currentDepartment = department;
  } else {
    return NextResponse.json({ error: "invalid department" }, { status: 400 });
  }

  const updated = await prisma.employee.update({
    where: { id },
    data: { currentDepartment },
    include: { currentStatus: true },
  });

  return NextResponse.json({ employee: updated });
}
