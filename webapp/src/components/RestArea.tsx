"use client";

import { EmployeeDto } from "@/lib/types";
import { NameTag } from "./NameTag";

export function RestArea({
  employees,
  onTap,
}: {
  employees: EmployeeDto[];
  onTap: (employee: EmployeeDto) => void;
}) {
  return (
    <section className="rounded-2xl border-4 border-dashed border-slate-300 bg-slate-50 p-4">
      <h2 className="mb-3 text-2xl font-bold text-slate-700">休み・待機</h2>
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4">
        {employees.map((employee) => (
          <NameTag key={employee.id} employee={employee} onTap={onTap} />
        ))}
        {employees.length === 0 && (
          <p className="col-span-full text-slate-400">該当者なし</p>
        )}
      </div>
    </section>
  );
}
