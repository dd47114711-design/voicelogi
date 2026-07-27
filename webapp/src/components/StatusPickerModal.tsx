"use client";

import { EmployeeDto, StatusDto } from "@/lib/types";
import { readableTextColor } from "@/lib/color";

export function StatusPickerModal({
  employee,
  statuses,
  onChoose,
  onClose,
}: {
  employee: EmployeeDto;
  statuses: StatusDto[];
  onChoose: (employee: EmployeeDto, status: StatusDto) => void;
  onClose: () => void;
}) {
  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 px-4"
      onClick={onClose}
    >
      <div
        className="w-full max-w-2xl rounded-2xl bg-white p-6 shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <h2 className="mb-6 text-center text-4xl font-bold text-slate-900">
          {employee.name}
        </h2>
        <div className="grid grid-cols-2 gap-5">
          {statuses.map((status) => (
            <button
              key={status.id}
              type="button"
              onClick={() => onChoose(employee, status)}
              className="flex h-28 items-center justify-center gap-2 rounded-xl border-4 border-slate-800/70 text-3xl font-bold shadow active:scale-95 transition-transform"
              style={{
                backgroundColor: status.color,
                color: readableTextColor(status.color),
              }}
            >
              <span aria-hidden>{status.icon}</span>
              {status.label}
            </button>
          ))}
        </div>
        <button
          type="button"
          onClick={onClose}
          className="mt-6 h-16 w-full rounded-xl bg-slate-200 text-2xl font-bold text-slate-700 active:scale-95 transition-transform"
        >
          とじる
        </button>
      </div>
    </div>
  );
}
