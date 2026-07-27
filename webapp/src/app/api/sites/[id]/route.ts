import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { WorkCategory, OrderCategory } from "@/generated/prisma/enums";

const VALID_WORK: WorkCategory[] = ["DOBOKU", "UNYU", "HOSO", "SONOTA"];
const VALID_ORDER: OrderCategory[] = ["KOKYO", "MINKAN", "FUMEI"];

export async function PATCH(
  request: NextRequest,
  ctx: RouteContext<"/api/sites/[id]">
) {
  const { id } = await ctx.params;
  const body = await request.json();

  const site = await prisma.site.findUnique({ where: { id } });
  if (!site) {
    return NextResponse.json({ error: "site not found" }, { status: 404 });
  }

  const data: {
    name?: string;
    workCategory?: WorkCategory;
    orderCategory?: OrderCategory;
    notes?: string | null;
    isActive?: boolean;
    needsReview?: boolean;
    reviewReason?: string | null;
    reviewedAt?: Date | null;
  } = {};

  if (body?.name !== undefined) {
    const name = typeof body.name === "string" ? body.name.trim() : "";
    if (name.length === 0) {
      return NextResponse.json({ error: "name must not be empty" }, { status: 400 });
    }
    data.name = name;
  }
  if (body?.workCategory !== undefined) {
    if (!VALID_WORK.includes(body.workCategory)) {
      return NextResponse.json({ error: "invalid workCategory" }, { status: 400 });
    }
    data.workCategory = body.workCategory;
  }
  if (body?.orderCategory !== undefined) {
    if (!VALID_ORDER.includes(body.orderCategory)) {
      return NextResponse.json({ error: "invalid orderCategory" }, { status: 400 });
    }
    data.orderCategory = body.orderCategory;
  }
  if (body?.notes !== undefined) {
    data.notes = typeof body.notes === "string" ? body.notes.trim() || null : null;
  }
  if (typeof body?.isActive === "boolean") {
    data.isActive = body.isActive;
  }
  // 「確認済みにする」操作: reviewed=true を渡すとフラグを解除し、確認日時を記録する
  if (body?.reviewed === true) {
    data.needsReview = false;
    data.reviewedAt = new Date();
  }

  const updated = await prisma.site.update({
    where: { id },
    data,
    include: { client: true, prices: { orderBy: { validFrom: "desc" } } },
  });

  return NextResponse.json({ site: updated });
}
