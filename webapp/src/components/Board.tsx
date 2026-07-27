"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { EmployeeDto, StatusDto } from "@/lib/types";
import { DepartmentSection } from "./DepartmentSection";
import { RestArea } from "./RestArea";
import { StatusPickerModal } from "./StatusPickerModal";

const REST_STATUS_ID = "yasumi";
const UNDO_WINDOW_MS = 6000;

type UndoInfo = {
  employeeId: string;
  employeeName: string;
  previousStatus: StatusDto;
  newStatusLabel: string;
};

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
  const [undoInfo, setUndoInfo] = useState<UndoInfo | null>(null);
  const undoTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    return () => {
      if (undoTimer.current) clearTimeout(undoTimer.current);
    };
  }, []);

  const doboku = useMemo(
    () =>
      employees.filter(
        (e) =>
          e.currentDepartment === "DOBOKU" && e.currentStatusId !== REST_STATUS_ID
      ),
    [employees]
  );
  const unyu = useMemo(
    () =>
      employees.filter(
        (e) =>
          e.currentDepartment === "UNYU" && e.currentStatusId !== REST_STATUS_ID
      ),
    [employees]
  );
  const resting = useMemo(
    () => employees.filter((e) => e.currentStatusId === REST_STATUS_ID),
    [employees]
  );

  async function applyStatus(employeeId: string, status: StatusDto) {
    const res = await fetch(`/api/employees/${employeeId}/status`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ statusId: status.id }),
    });
    if (!res.ok) {
      throw new Error("状態の更新に失敗しました");
    }
  }

  async function handleChoose(employee: EmployeeDto, status: StatusDto) {
    setSelected(null);
    const previousStatus = employee.currentStatus;
    const previousEmployees = employees;

    setEmployees((current) =>
      current.map((e) =>
        e.id === employee.id
          ? { ...e, currentStatusId: status.id, currentStatus: status }
          : e
      )
    );

    try {
      await applyStatus(employee.id, status);

      if (undoTimer.current) clearTimeout(undoTimer.current);
      setUndoInfo({
        employeeId: employee.id,
        employeeName: employee.name,
        previousStatus,
        newStatusLabel: status.label,
      });
      undoTimer.current = setTimeout(() => setUndoInfo(null), UNDO_WINDOW_MS);
    } catch (err) {
      setEmployees(previousEmployees);
      setErrorMessage(
        err instanceof Error ? err.message : "状態の更新に失敗しました"
      );
    }
  }

  async function handleUndo() {
    if (!undoInfo) return;
    const { employeeId, previousStatus } = undoInfo;
    if (undoTimer.current) clearTimeout(undoTimer.current);
    setUndoInfo(null);

    const previousEmployees = employees;
    setEmployees((current) =>
      current.map((e) =>
        e.id === employeeId
          ? { ...e, currentStatusId: previousStatus.id, currentStatus: previousStatus }
          : e
      )
    );

    try {
      await applyStatus(employeeId, previousStatus);
    } catch (err) {
      setEmployees(previousEmployees);
      setErrorMessage(
        err instanceof Error ? err.message : "取り消しに失敗しました"
      );
    }
  }

  return (
    <div className="mx-auto max-w-5xl px-4 py-6 pb-28">
      {errorMessage && (
        <div
          className="mb-4 rounded-xl border-4 border-red-400 bg-red-50 p-4 text-lg font-bold text-red-700"
          onClick={() => setErrorMessage(null)}
        >
          {errorMessage}（タップで閉じる）
        </div>
      )}

      <DepartmentSection
        title="土木"
        department="DOBOKU"
        employees={doboku}
        onTap={setSelected}
      />
      <DepartmentSection
        title="運輸"
        department="UNYU"
        employees={unyu}
        onTap={setSelected}
      />
      <RestArea employees={resting} onTap={setSelected} />

      {selected && (
        <StatusPickerModal
          employee={selected}
          statuses={statuses}
          onChoose={handleChoose}
          onClose={() => setSelected(null)}
        />
      )}

      {undoInfo && (
        <div className="fixed inset-x-0 bottom-0 z-40 flex justify-center px-4 pb-4">
          <div className="flex w-full max-w-xl items-center justify-between gap-4 rounded-xl bg-slate-900 px-5 py-4 text-white shadow-2xl">
            <span className="text-lg font-semibold">
              {undoInfo.employeeName}さんを「{undoInfo.newStatusLabel}」にしました
            </span>
            <button
              type="button"
              onClick={handleUndo}
              className="shrink-0 rounded-lg bg-white px-4 py-2 text-lg font-bold text-slate-900 active:scale-95 transition-transform"
            >
              元に戻す
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
