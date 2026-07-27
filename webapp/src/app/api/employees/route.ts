import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { Department } from "@/generated/prisma/enums";

const DEFAULT_STATUS_ID = "shukkin";
const VALID_DEPARTMENTS: Department[] = ["DOBOKU", "UNYU"];

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

export async function POST(request: NextRequest) {
  const body = await request.json();
  const name = typeof body?.name === "string" ? body.name.trim() : "";
  const department = body?.department;

  if (name.length === 0) {
    return NextResponse.json({ error: "name is required" }, { status: 400 });
  }
  if (!VALID_DEPARTMENTS.includes(department)) {
    return NextResponse.json({ error: "invalid department" }, { status: 400 });
  }

  const last = await prisma.employee.findFirst({
    orderBy: { displayOrder: "desc" },
  });
  const displayOrder = (last?.displayOrder ?? -1) + 1;

  const employee = await prisma.employee.create({
    data: {
      name,
      homeDepartment: department,
      currentDepartment: department,
      displayOrder,
      currentStatusId: DEFAULT_STATUS_ID,
    },
    include: { currentStatus: true },
  });

  return NextResponse.json({ employee }, { status: 201 });
}
