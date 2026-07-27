import Link from "next/link";
import { prisma } from "@/lib/db";
import { Board } from "@/components/Board";

export const dynamic = "force-dynamic";

function formatToday() {
  const now = new Date();
  const weekday = ["日", "月", "火", "水", "木", "金", "土"][now.getDay()];
  return `${now.getFullYear()}/${now.getMonth() + 1}/${now.getDate()}（${weekday}）`;
}

export default async function Home() {
  const [employees, statuses] = await Promise.all([
    prisma.employee.findMany({
      where: { isActive: true },
      orderBy: { displayOrder: "asc" },
      include: { currentStatus: true },
    }),
    prisma.status.findMany({ orderBy: { sortOrder: "asc" } }),
  ]);

  return (
    <div className="min-h-screen bg-slate-100">
      <header className="sticky top-0 z-10 flex items-center justify-between border-b-4 border-slate-800 bg-white px-6 py-4 shadow">
        <h1 className="text-3xl font-extrabold tracking-tight text-slate-900">
          KoeHaisha
        </h1>
        <div className="flex items-center gap-4">
          <span className="text-xl font-bold text-slate-600">{formatToday()}</span>
          <Link href="/admin" className="text-xs text-slate-300">
            管理
          </Link>
        </div>
      </header>
      <Board initialEmployees={employees} statuses={statuses} />
    </div>
  );
}
