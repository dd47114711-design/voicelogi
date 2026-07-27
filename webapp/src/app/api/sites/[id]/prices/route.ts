import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";

function toNullableInt(value: unknown): number | null {
  if (value === null || value === undefined || value === "") return null;
  const n = Number(value);
  return Number.isFinite(n) ? Math.round(n) : null;
}

function toNullableDate(value: unknown): Date | null {
  if (value === null || value === undefined || value === "") return null;
  const d = new Date(value as string);
  return Number.isNaN(d.getTime()) ? null : d;
}

export async function POST(
  request: NextRequest,
  ctx: RouteContext<"/api/sites/[id]/prices">
) {
  const { id: siteId } = await ctx.params;
  const body = await request.json();

  const site = await prisma.site.findUnique({ where: { id: siteId } });
  if (!site) {
    return NextResponse.json({ error: "site not found" }, { status: 404 });
  }

  const price = await prisma.sitePrice.create({
    data: {
      siteId,
      vehicleType: typeof body?.vehicleType === "string" ? body.vehicleType.trim() || null : null,
      dayPrice: toNullableInt(body?.dayPrice),
      nightPrice: toNullableInt(body?.nightPrice),
      otherPrice: toNullableInt(body?.otherPrice),
      validFrom: toNullableDate(body?.validFrom),
      validTo: toNullableDate(body?.validTo),
      notes: typeof body?.notes === "string" ? body.notes.trim() || null : null,
    },
  });

  return NextResponse.json({ price }, { status: 201 });
}
