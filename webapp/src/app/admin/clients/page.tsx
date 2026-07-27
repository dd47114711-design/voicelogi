import Link from "next/link";
import { prisma } from "@/lib/db";
import { ClientAdmin } from "@/components/admin/ClientAdmin";

export const dynamic = "force-dynamic";

export default async function ClientsPage() {
  const clients = await prisma.client.findMany({
    where: { isActive: true },
    orderBy: { name: "asc" },
  });

  return (
    <div className="min-h-screen bg-slate-100">
      <header className="flex items-center justify-between border-b-4 border-slate-800 bg-white px-6 py-4 shadow">
        <h1 className="text-2xl font-extrabold tracking-tight text-slate-900">
          取引先マスター
        </h1>
        <nav className="flex gap-4 text-lg font-semibold">
          <Link href="/admin/sites" className="text-blue-700 underline">
            現場マスターへ
          </Link>
          <Link href="/admin" className="text-blue-700 underline">
            社員管理へ
          </Link>
        </nav>
      </header>
      <ClientAdmin initialClients={clients} />
    </div>
  );
}
