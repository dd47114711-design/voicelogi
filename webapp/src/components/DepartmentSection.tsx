"use client";

import { EmployeeDto } from "@/lib/types";
import { NameTag } from "./NameTag";

// 状態の色(白/青/緑/赤/橙/灰)と混同しないよう、部門の区切りには
// あえて別系統の色(紫・青緑)を使って視覚的にはっきり分ける。
const THEME = {
  DOBOKU: {
    container: "border-violet-400 bg-violet-50",
    heading: "text-violet-900",
  },
  UNYU: {
    container: "border-teal-400 bg-teal-50",
    heading: "text-teal-900",
  },
} as const;

export function DepartmentSection({
  title,
  department,
  employees,
  onTap,
}: {
  title: string;
  department: keyof typeof THEME;
  employees: EmployeeDto[];
  onTap: (employee: EmployeeDto) => void;
}) {
  const theme = THEME[department];
  return (
    <section className={`mb-6 rounded-2xl border-4 p-4 ${theme.container}`}>
      <h2 className={`mb-3 text-3xl font-extrabold ${theme.heading}`}>{title}</h2>
      <div className="grid grid-cols-2 gap-3 md:grid-cols-3">
        {employees.map((employee) => (
          <NameTag key={employee.id} employee={employee} onTap={onTap} />
        ))}
        {employees.length === 0 && (
          <p className="col-span-full text-slate-400">対象者なし</p>
        )}
      </div>
    </section>
  );
}
