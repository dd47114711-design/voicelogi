import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { WorkCategory, OrderCategory } from "@/generated/prisma/enums";

const VALID_WORK: WorkCategory[] = ["DOBOKU", "UNYU", "HOSO", "SONOTA"];
const VALID_ORDER: OrderCategory[] = ["KOKYO", "MINKAN", "FUMEI"];

export async function GET(request: NextRequest) {
  const q = request.nextUrl.searchParams.get("q")?.trim().toLowerCase() ?? "";

  const sites = await prisma.site.findMany({
    where: { isActive: true },
    orderBy: [{ client: { name: "asc" } }, { name: "asc" }],
    include: { client: true, prices: { orderBy: { validFrom: "desc" } } },
  });

  if (q.length === 0) {
    return NextResponse.json({ sites });
  }

  const filtered = sites.filter((site) => {
    const haystack = [
      site.client.name,
      site.name,
      site.workCategory,
      site.orderCategory,
      site.notes ?? "",
      ...site.prices.map((p) => p.vehicleType ?? ""),
    ]
      .join(" ")
      .toLowerCase();
    return haystack.includes(q);
  });

  return NextResponse.json({ sites: filtered });
}

export async function POST(request: NextRequest) {
  const body = await request.json();
  const clientId = body?.clientId;
  const name = typeof body?.name === "string" ? body.name.trim() : "";
  const workCategory = body?.workCategory;
  const orderCategory = body?.orderCategory;
  const notes = typeof body?.notes === "string" ? body.notes.trim() : null;

  if (typeof clientId !== "string" || clientId.length === 0) {
    return NextResponse.json({ error: "clientId is required" }, { status: 400 });
  }
  if (name.length === 0) {
    return NextResponse.json({ error: "name is required" }, { status: 400 });
  }
  if (!VALID_WORK.includes(workCategory)) {
    return NextResponse.json({ error: "invalid workCategory" }, { status: 400 });
  }
  if (!VALID_ORDER.includes(orderCategory)) {
    return NextResponse.json({ error: "invalid orderCategory" }, { status: 400 });
  }

  const client = await prisma.client.findUnique({ where: { id: clientId } });
  if (!client) {
    return NextResponse.json({ error: "client not found" }, { status: 404 });
  }

  const site = await prisma.site.create({
    data: { clientId, name, workCategory, orderCategory, notes },
    include: { client: true, prices: true },
  });

  return NextResponse.json({ site }, { status: 201 });
}
