"use client";

import { useState } from "react";
import { ClientDto } from "@/lib/types";

export function ClientAdmin({ initialClients }: { initialClients: ClientDto[] }) {
  const [clients, setClients] = useState(initialClients);
  const [newName, setNewName] = useState("");
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editingName, setEditingName] = useState("");
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  async function refresh() {
    const res = await fetch("/api/clients");
    const data = await res.json();
    setClients(data.clients);
  }

  async function handleAdd() {
    const name = newName.trim();
    if (name.length === 0) return;
    const res = await fetch("/api/clients", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name }),
    });
    if (!res.ok) {
      setErrorMessage("追加に失敗しました");
      return;
    }
    setNewName("");
    await refresh();
  }

  async function handleSaveEdit(id: string) {
    const name = editingName.trim();
    if (name.length === 0) return;
    const res = await fetch(`/api/clients/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name }),
    });
    if (!res.ok) {
      setErrorMessage("更新に失敗しました");
      return;
    }
    setEditingId(null);
    await refresh();
  }

  async function handleToggleActive(id: string, isActive: boolean) {
    const res = await fetch(`/api/clients/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ isActive: !isActive }),
    });
    if (!res.ok) {
      setErrorMessage("更新に失敗しました");
      return;
    }
    await refresh();
  }

  return (
    <div className="mx-auto max-w-2xl px-4 py-6">
      {errorMessage && (
        <div
          className="mb-4 rounded-xl border-4 border-red-400 bg-red-50 p-4 text-lg font-bold text-red-700"
          onClick={() => setErrorMessage(null)}
        >
          {errorMessage}（タップで閉じる）
        </div>
      )}

      <section className="mb-6 rounded-2xl border-4 border-slate-300 bg-white p-4">
        <h2 className="mb-3 text-xl font-bold text-slate-800">取引先を追加</h2>
        <div className="flex flex-col gap-3 sm:flex-row">
          <input
            type="text"
            value={newName}
            onChange={(e) => setNewName(e.target.value)}
            placeholder="会社名"
            className="flex-1 rounded-lg border-2 border-slate-300 px-3 py-2 text-lg"
          />
          <button
            type="button"
            onClick={handleAdd}
            className="rounded-lg bg-blue-600 px-6 py-2 text-lg font-bold text-white active:scale-95 transition-transform"
          >
            追加
          </button>
        </div>
      </section>

      <section className="rounded-2xl border-4 border-slate-300 bg-white p-4">
        <h2 className="mb-3 text-xl font-bold text-slate-800">
          取引先一覧（{clients.length}件）
        </h2>
        <ul className="flex flex-col gap-2">
          {clients.map((client) => (
            <li
              key={client.id}
              className="flex items-center gap-2 rounded-lg border-2 border-slate-200 p-2"
            >
              {editingId === client.id ? (
                <>
                  <input
                    type="text"
                    value={editingName}
                    onChange={(e) => setEditingName(e.target.value)}
                    className="flex-1 rounded-lg border-2 border-slate-300 px-3 py-2 text-lg"
                  />
                  <button
                    type="button"
                    onClick={() => handleSaveEdit(client.id)}
                    className="rounded-md bg-blue-600 px-3 py-2 text-lg font-bold text-white"
                  >
                    保存
                  </button>
                  <button
                    type="button"
                    onClick={() => setEditingId(null)}
                    className="rounded-md bg-slate-200 px-3 py-2 text-lg font-bold"
                  >
                    取消
                  </button>
                </>
              ) : (
                <>
                  <span className="flex-1 text-lg font-semibold text-slate-900">
                    {client.name}
                  </span>
                  <button
                    type="button"
                    onClick={() => {
                      setEditingId(client.id);
                      setEditingName(client.name);
                    }}
                    className="rounded-md bg-amber-200 px-3 py-2 text-lg font-bold"
                  >
                    編集
                  </button>
                  <button
                    type="button"
                    onClick={() => handleToggleActive(client.id, client.isActive)}
                    className="rounded-md bg-red-200 px-3 py-2 text-lg font-bold"
                  >
                    無効化
                  </button>
                </>
              )}
            </li>
          ))}
          {clients.length === 0 && <li className="text-slate-400">取引先がありません</li>}
        </ul>
      </section>
    </div>
  );
}
