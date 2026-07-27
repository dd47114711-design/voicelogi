"use client";

import { useMemo, useState } from "react";
import { EmployeeDto, StatusDto } from "@/lib/types";
import { DepartmentSection } from "./DepartmentSection";
import { RestArea } from "./RestArea";
import { StatusPickerModal } from "./StatusPickerModal";

const REST_STATUS_ID = "yasumi";

export function Board({
  initialEmployees,
  statuses,
}: {
  initialEmployees: EmployeeDto[];
  statuses: StatusDto[];
}) {
  const [employees, setEmployees] = useState(initialEmployees);
  const [selected, setSelected] = useState<EmployeeDto | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const doboku = useMemo(
    () =>
      employees.filter(
        (e) => e.department === "DOBOKU" && e.currentStatusId !== REST_STATUS_ID
      ),
    [employees]
  );
  const unyu = useMemo(
    () =>
      employees.filter(
        (e) => e.department === "UNYU" && e.currentStatusId !== REST_STATUS_ID
      ),
    [employees]
  );
  const resting = useMemo(
    () => employees.filter((e) => e.currentStatusId === REST_STATUS_ID),
    [employees]
  );

  async function handleChoose(employee: EmployeeDto, status: StatusDto) {
    setSelected(null);
    const previous = employees;
    setEmployees((current) =>
      current.map((e) =>
        e.id === employee.id
          ? { ...e, currentStatusId: status.id, currentStatus: status }
          : e
      )
    );

    try {
      const res = await fetch(`/api/employees/${employee.id}/status`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ statusId: status.id }),
      });
      if (!res.ok) {
        throw new Error("状態の更新に失敗しました");
      }
    } catch (err) {
      setEmployees(previous);
      setErrorMessage(
        err instanceof Error ? err.message : "状態の更新に失敗しました"
      );
    }
  }

  return (
    <div className="mx-auto max-w-5xl px-4 py-6">
      {errorMessage && (
        <div
          className="mb-4 rounded-xl border-4 border-red-400 bg-red-50 p-4 text-lg font-bold text-red-700"
          onClick={() => setErrorMessage(null)}
        >
          {errorMessage}（タップで閉じる）
        </div>
      )}

      <DepartmentSection title="土木" employees={doboku} onTap={setSelected} />
      <DepartmentSection title="運輸" employees={unyu} onTap={setSelected} />
      <RestArea employees={resting} onTap={setSelected} />

      {selected && (
        <StatusPickerModal
          employee={selected}
          statuses={statuses}
          onChoose={handleChoose}
          onClose={() => setSelected(null)}
        />
      )}
    </div>
  );
}
