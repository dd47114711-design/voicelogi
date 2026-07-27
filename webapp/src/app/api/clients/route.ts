import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";

export async function GET() {
  const clients = await prisma.client.findMany({
    where: { isActive: true },
    orderBy: { name: "asc" },
  });
  return NextResponse.json({ clients });
}

export async function POST(request: NextRequest) {
  const body = await request.json();
  const name = typeof body?.name === "string" ? body.name.trim() : "";

  if (name.length === 0) {
    return NextResponse.json({ error: "name is required" }, { status: 400 });
  }

  const client = await prisma.client.create({ data: { name } });
  return NextResponse.json({ client }, { status: 201 });
}
