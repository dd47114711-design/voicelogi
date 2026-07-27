"use client";

import { EmployeeDto } from "@/lib/types";
import { readableTextColor } from "@/lib/color";

export function NameTag({
  employee,
  onTap,
}: {
  employee: EmployeeDto;
  onTap: (employee: EmployeeDto) => void;
}) {
  const color = employee.currentStatus.color;
  return (
    <button
      type="button"
      onClick={() => onTap(employee)}
      className="flex h-24 w-full flex-col items-center justify-center rounded-xl border-4 border-slate-800/70 shadow-md active:scale-95 transition-transform"
      style={{ backgroundColor: color, color: readableTextColor(color) }}
    >
      <span className="text-2xl font-bold leading-tight">{employee.name}</span>
      <span className="text-base font-semibold opacity-90">
        {employee.currentStatus.label}
      </span>
    </button>
  );
}
