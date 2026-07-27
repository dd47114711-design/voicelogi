import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";

function toNullableInt(value: unknown): number | null | undefined {
  if (value === undefined) return undefined;
  if (value === null || value === "") return null;
  const n = Number(value);
  return Number.isFinite(n) ? Math.round(n) : null;
}

function toNullableDate(value: unknown): Date | null | undefined {
  if (value === undefined) return undefined;
  if (value === null || value === "") return null;
  const d = new Date(value as string);
  return Number.isNaN(d.getTime()) ? null : d;
}

export async function PATCH(
  request: NextRequest,
  ctx: RouteContext<"/api/sites/[id]/prices/[priceId]">
) {
  const { priceId } = await ctx.params;
  const body = await request.json();

  const price = await prisma.sitePrice.findUnique({ where: { id: priceId } });
  if (!price) {
    return NextResponse.json({ error: "price not found" }, { status: 404 });
  }

  const data: Record<string, unknown> = {};
  if (body?.vehicleType !== undefined) {
    data.vehicleType =
      typeof body.vehicleType === "string" ? body.vehicleType.trim() || null : null;
  }
  const dayPrice = toNullableInt(body?.dayPrice);
  if (dayPrice !== undefined) data.dayPrice = dayPrice;
  const nightPrice = toNullableInt(body?.nightPrice);
  if (nightPrice !== undefined) data.nightPrice = nightPrice;
  const otherPrice = toNullableInt(body?.otherPrice);
  if (otherPrice !== undefined) data.otherPrice = otherPrice;
  const validFrom = toNullableDate(body?.validFrom);
  if (validFrom !== undefined) data.validFrom = validFrom;
  const validTo = toNullableDate(body?.validTo);
  if (validTo !== undefined) data.validTo = validTo;
  if (body?.notes !== undefined) {
    data.notes = typeof body.notes === "string" ? body.notes.trim() || null : null;
  }
  if (body?.reviewed === true) {
    data.needsReview = false;
    data.reviewedAt = new Date();
  }

  const updated = await prisma.sitePrice.update({ where: { id: priceId }, data });
  return NextResponse.json({ price: updated });
}
