import Link from "next/link";
import { prisma } from "@/lib/db";
import { EmployeeAdmin } from "@/components/admin/EmployeeAdmin";

export const dynamic = "force-dynamic";

export default async function AdminPage() {
  const [employees, deletedEmployees] = await Promise.all([
    prisma.employee.findMany({
      where: { isActive: true },
      orderBy: { displayOrder: "asc" },
      include: { currentStatus: true },
    }),
    prisma.employee.findMany({
      where: { isActive: false },
      orderBy: { updatedAt: "desc" },
      include: { currentStatus: true },
    }),
  ]);

  return (
    <div className="min-h-screen bg-slate-100">
      <header className="flex items-center justify-between border-b-4 border-slate-800 bg-white px-6 py-4 shadow">
        <h1 className="text-2xl font-extrabold tracking-tight text-slate-900">
          社員管理
        </h1>
        <nav className="flex gap-4 text-lg font-semibold">
          <Link href="/admin/clients" className="text-blue-700 underline">
            取引先マスターへ
          </Link>
          <Link href="/admin/sites" className="text-blue-700 underline">
            現場マスターへ
          </Link>
          <Link href="/" className="text-blue-700 underline">
            出欠札ボードに戻る
          </Link>
        </nav>
      </header>
      <EmployeeAdmin initialEmployees={employees} initialDeletedEmployees={deletedEmployees} />
    </div>
  );
}
