"use client";

import { useMemo, useState } from "react";
import { EmployeeDto, Department } from "@/lib/types";

const DEPARTMENT_LABEL: Record<Department, string> = {
  DOBOKU: "土木",
  UNYU: "運輸",
};

export function EmployeeAdmin({
  initialEmployees,
}: {
  initialEmployees: EmployeeDto[];
}) {
  const [employees, setEmployees] = useState(initialEmployees);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [newName, setNewName] = useState("");
  const [newDepartment, setNewDepartment] = useState<Department>("UNYU");
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const grouped = useMemo(() => {
    const sorted = [...employees].sort((a, b) => a.displayOrder - b.displayOrder);
    return {
      DOBOKU: sorted.filter((e) => e.currentDepartment === "DOBOKU"),
      UNYU: sorted.filter((e) => e.currentDepartment === "UNYU"),
    };
  }, [employees]);

  async function refresh() {
    const res = await fetch("/api/employees");
    const data = await res.json();
    setEmployees(data.employees);
  }

  async function handleAdd() {
    const name = newName.trim();
    if (name.length === 0) return;

    const res = await fetch("/api/employees", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name, department: newDepartment }),
    });

    if (!res.ok) {
      setErrorMessage("追加に失敗しました");
      return;
    }
    setNewName("");
    await refresh();
  }

  async function handleEditSave(id: string, name: string, department: Department) {
    const res = await fetch(`/api/employees/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name, department }),
    });
    if (!res.ok) {
      setErrorMessage("更新に失敗しました");
      return;
    }
    setEditingId(null);
    await refresh();
  }

  async function handleDelete(id: string, name: string) {
    if (!window.confirm(`「${name}」を一覧から削除しますか？（過去の記録は残ります）`)) {
      return;
    }
    const res = await fetch(`/api/employees/${id}`, { method: "DELETE" });
    if (!res.ok) {
      setErrorMessage("削除に失敗しました");
      return;
    }
    await refresh();
  }

  async function handleReorder(id: string, direction: "up" | "down") {
    const res = await fetch(`/api/employees/${id}/reorder`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ direction }),
    });
    if (!res.ok) {
      setErrorMessage("並び替えに失敗しました");
      return;
    }
    await refresh();
  }

  // 「応援」：本来の所属(home)は変えず、今日だけの表示部門(current)だけ切り替える。
  // department を省略すると本来の所属に戻す(応援解除)。
  async function handleSetSupport(id: string, department?: Department) {
    const res = await fetch(`/api/employees/${id}/current-department`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ department: department ?? null }),
    });
    if (!res.ok) {
      setErrorMessage("応援設定の変更に失敗しました");
      return;
    }
    await refresh();
  }

  return (
    <div className="mx-auto max-w-3xl px-4 py-6">
      {errorMessage && (
        <div
          className="mb-4 rounded-xl border-4 border-red-400 bg-red-50 p-4 text-lg font-bold text-red-700"
          onClick={() => setErrorMessage(null)}
        >
          {errorMessage}（タップで閉じる）
        </div>
      )}

      <section className="mb-8 rounded-2xl border-4 border-slate-300 bg-white p-4">
        <h2 className="mb-3 text-xl font-bold text-slate-800">社員を追加</h2>
        <div className="flex flex-col gap-3 sm:flex-row">
          <input
            type="text"
            value={newName}
            onChange={(e) => setNewName(e.target.value)}
            placeholder="氏名"
            className="flex-1 rounded-lg border-2 border-slate-300 px-3 py-2 text-lg"
          />
          <select
            value={newDepartment}
            onChange={(e) => setNewDepartment(e.target.value as Department)}
            className="rounded-lg border-2 border-slate-300 px-3 py-2 text-lg"
          >
            <option value="DOBOKU">土木</option>
            <option value="UNYU">運輸</option>
          </select>
          <button
            type="button"
            onClick={handleAdd}
            className="rounded-lg bg-blue-600 px-6 py-2 text-lg font-bold text-white active:scale-95 transition-transform"
          >
            追加
          </button>
        </div>
      </section>

      {(["DOBOKU", "UNYU"] as const).map((dept) => (
        <section key={dept} className="mb-6 rounded-2xl border-4 border-slate-300 bg-white p-4">
          <h2 className="mb-3 text-xl font-bold text-slate-800">
            {DEPARTMENT_LABEL[dept]}
          </h2>
          <ul className="flex flex-col gap-2">
            {grouped[dept].map((employee, index) => (
              <li
                key={employee.id}
                className="flex items-center gap-2 rounded-lg border-2 border-slate-200 p-2"
              >
                {editingId === employee.id ? (
                  <EditRow
                    employee={employee}
                    onCancel={() => setEditingId(null)}
                    onSave={handleEditSave}
                  />
                ) : (
                  <>
                    <span className="flex flex-1 flex-col">
                      <span className="text-lg font-semibold text-slate-900">
                        {employee.name}
                      </span>
                      {employee.currentDepartment !== employee.homeDepartment && (
                        <span className="text-sm font-bold text-orange-600">
                          応援中（本来は{DEPARTMENT_LABEL[employee.homeDepartment]}）
                        </span>
                      )}
                    </span>
                    <button
                      type="button"
                      onClick={() => handleReorder(employee.id, "up")}
                      disabled={index === 0}
                      className="rounded-md bg-slate-200 px-3 py-2 text-lg font-bold disabled:opacity-30"
                    >
                      ↑
                    </button>
                    <button
                      type="button"
                      onClick={() => handleReorder(employee.id, "down")}
                      disabled={index === grouped[dept].length - 1}
                      className="rounded-md bg-slate-200 px-3 py-2 text-lg font-bold disabled:opacity-30"
                    >
                      ↓
                    </button>
                    {employee.currentDepartment !== employee.homeDepartment ? (
                      <button
                        type="button"
                        onClick={() => handleSetSupport(employee.id)}
                        className="rounded-md bg-orange-200 px-3 py-2 text-lg font-bold"
                      >
                        応援解除
                      </button>
                    ) : (
                      <button
                        type="button"
                        onClick={() =>
                          handleSetSupport(
                            employee.id,
                            employee.homeDepartment === "DOBOKU" ? "UNYU" : "DOBOKU"
                          )
                        }
                        className="rounded-md bg-slate-200 px-3 py-2 text-lg font-bold"
                      >
                        {DEPARTMENT_LABEL[employee.homeDepartment === "DOBOKU" ? "UNYU" : "DOBOKU"]}
                        へ応援
                      </button>
                    )}
                    <button
                      type="button"
                      onClick={() => setEditingId(employee.id)}
                      className="rounded-md bg-amber-200 px-3 py-2 text-lg font-bold"
                    >
                      編集
                    </button>
                    <button
                      type="button"
                      onClick={() => handleDelete(employee.id, employee.name)}
                      className="rounded-md bg-red-200 px-3 py-2 text-lg font-bold"
                    >
                      削除
                    </button>
                  </>
                )}
              </li>
            ))}
            {grouped[dept].length === 0 && (
              <li className="text-slate-400">対象者なし</li>
            )}
          </ul>
        </section>
      ))}
    </div>
  );
}

function EditRow({
  employee,
  onSave,
  onCancel,
}: {
  employee: EmployeeDto;
  onSave: (id: string, name: string, department: Department) => void;
  onCancel: () => void;
}) {
  const [name, setName] = useState(employee.name);
  const [department, setDepartment] = useState<Department>(employee.homeDepartment);

  return (
    <>
      <input
        type="text"
        value={name}
        onChange={(e) => setName(e.target.value)}
        className="flex-1 rounded-lg border-2 border-slate-300 px-3 py-2 text-lg"
      />
      <label className="flex items-center gap-1 text-sm text-slate-500">
        本来の所属
        <select
          value={department}
          onChange={(e) => setDepartment(e.target.value as Department)}
          className="rounded-lg border-2 border-slate-300 px-3 py-2 text-lg text-slate-900"
        >
          <option value="DOBOKU">土木</option>
          <option value="UNYU">運輸</option>
        </select>
      </label>
      <button
        type="button"
        onClick={() => onSave(employee.id, name, department)}
        className="rounded-md bg-blue-600 px-3 py-2 text-lg font-bold text-white"
      >
        保存
      </button>
      <button
        type="button"
        onClick={onCancel}
        className="rounded-md bg-slate-200 px-3 py-2 text-lg font-bold"
      >
        取消
      </button>
    </>
  );
}
