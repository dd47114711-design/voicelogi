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
  const isSupporting = employee.currentDepartment !== employee.homeDepartment;
  return (
    <button
      type="button"
      onClick={() => onTap(employee)}
      // min-h は将来会社名・車両番号などの補足行を追加してもレイアウトが
      // 崩れないよう、現時点で必要な高さより余裕を持たせている
      className="relative flex min-h-40 w-full flex-col items-center justify-center gap-1 rounded-xl border-4 border-slate-800/70 px-2 py-4 shadow-md active:scale-95 transition-transform"
      style={{ backgroundColor: color, color: readableTextColor(color) }}
    >
      {isSupporting && (
        <span className="absolute -top-3 left-1/2 -translate-x-1/2 rounded-full bg-orange-500 px-3 py-0.5 text-sm font-bold text-white shadow">
          応援
        </span>
      )}
      <span className="text-4xl font-bold leading-tight">{employee.name}</span>
      <span className="flex items-center gap-1 text-2xl font-semibold opacity-90">
        <span aria-hidden>{employee.currentStatus.icon}</span>
        {employee.currentStatus.label}
      </span>
    </button>
  );
}
