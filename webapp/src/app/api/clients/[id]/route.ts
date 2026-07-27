import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";

export async function PATCH(
  request: NextRequest,
  ctx: RouteContext<"/api/clients/[id]">
) {
  const { id } = await ctx.params;
  const body = await request.json();

  const data: { name?: string; isActive?: boolean } = {};
  if (body?.name !== undefined) {
    const name = typeof body.name === "string" ? body.name.trim() : "";
    if (name.length === 0) {
      return NextResponse.json({ error: "name must not be empty" }, { status: 400 });
    }
    data.name = name;
  }
  if (typeof body?.isActive === "boolean") {
    data.isActive = body.isActive;
  }

  const client = await prisma.client.findUnique({ where: { id } });
  if (!client) {
    return NextResponse.json({ error: "client not found" }, { status: 404 });
  }

  const updated = await prisma.client.update({ where: { id }, data });
  return NextResponse.json({ client: updated });
}
