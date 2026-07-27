"use client";

import { EmployeeDto } from "@/lib/types";
import { NameTag } from "./NameTag";

export function DepartmentSection({
  title,
  employees,
  onTap,
}: {
  title: string;
  employees: EmployeeDto[];
  onTap: (employee: EmployeeDto) => void;
}) {
  return (
    <section className="mb-6">
      <h2 className="mb-3 text-2xl font-bold text-slate-700">{title}</h2>
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4">
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
