import Link from "next/link";
import { prisma } from "@/lib/db";
import { EmployeeAdmin } from "@/components/admin/EmployeeAdmin";

export const dynamic = "force-dynamic";

export default async function AdminPage() {
  const employees = await prisma.employee.findMany({
    where: { isActive: true },
    orderBy: { displayOrder: "asc" },
    include: { currentStatus: true },
  });

  return (
    <div className="min-h-screen bg-slate-100">
      <header className="flex items-center justify-between border-b-4 border-slate-800 bg-white px-6 py-4 shadow">
        <h1 className="text-2xl font-extrabold tracking-tight text-slate-900">
          社員管理
        </h1>
        <Link href="/" className="text-lg font-semibold text-blue-700 underline">
          出欠札ボードに戻る
        </Link>
      </header>
      <EmployeeAdmin initialEmployees={employees} />
    </div>
  );
}
