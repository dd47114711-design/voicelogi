import Link from "next/link";
import { prisma } from "@/lib/db";
import { SiteAdmin } from "@/components/admin/SiteAdmin";

export const dynamic = "force-dynamic";

export default async function SitesPage() {
  const [sites, clients] = await Promise.all([
    prisma.site.findMany({
      where: { isActive: true },
      orderBy: [{ client: { name: "asc" } }, { name: "asc" }],
      include: { client: true, prices: { orderBy: { validFrom: "desc" } } },
    }),
    prisma.client.findMany({ where: { isActive: true }, orderBy: { name: "asc" } }),
  ]);

  return (
    <div className="min-h-screen bg-slate-100">
      <header className="flex items-center justify-between border-b-4 border-slate-800 bg-white px-6 py-4 shadow">
        <h1 className="text-2xl font-extrabold tracking-tight text-slate-900">
          現場マスター
        </h1>
        <nav className="flex gap-4 text-lg font-semibold">
          <Link href="/admin/clients" className="text-blue-700 underline">
            取引先マスターへ
          </Link>
          <Link href="/admin" className="text-blue-700 underline">
            社員管理へ
          </Link>
        </nav>
      </header>
      <SiteAdmin initialSites={JSON.parse(JSON.stringify(sites))} clients={clients} />
    </div>
  );
}
