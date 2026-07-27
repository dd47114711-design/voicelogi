"use client";

import { useState } from "react";
import { SitePriceDto } from "@/lib/types";

function formatDate(value: string | null) {
  if (!value) return "";
  return value.slice(0, 10);
}

function formatPrice(value: number | null) {
  return value === null ? "―" : `${value.toLocaleString()}円`;
}

export function SitePriceRow({
  price,
  onSaved,
  onError,
}: {
  price: SitePriceDto;
  onSaved: () => void;
  onError: (message: string) => void;
}) {
  const [editing, setEditing] = useState(false);
  const [vehicleType, setVehicleType] = useState(price.vehicleType ?? "");
  const [dayPrice, setDayPrice] = useState(price.dayPrice?.toString() ?? "");
  const [nightPrice, setNightPrice] = useState(price.nightPrice?.toString() ?? "");
  const [otherPrice, setOtherPrice] = useState(price.otherPrice?.toString() ?? "");
  const [validFrom, setValidFrom] = useState(formatDate(price.validFrom));
  const [validTo, setValidTo] = useState(formatDate(price.validTo));
  const [notes, setNotes] = useState(price.notes ?? "");

  async function save() {
    const res = await fetch(`/api/sites/${price.siteId}/prices/${price.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        vehicleType: vehicleType || null,
        dayPrice: dayPrice === "" ? null : Number(dayPrice),
        nightPrice: nightPrice === "" ? null : Number(nightPrice),
        otherPrice: otherPrice === "" ? null : Number(otherPrice),
        validFrom: validFrom || null,
        validTo: validTo || null,
        notes: notes || null,
      }),
    });
    if (!res.ok) {
      onError("単価の更新に失敗しました");
      return;
    }
    setEditing(false);
    onSaved();
  }

  async function markReviewed() {
    const res = await fetch(`/api/sites/${price.siteId}/prices/${price.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ reviewed: true }),
    });
    if (!res.ok) {
      onError("確認済みへの変更に失敗しました");
      return;
    }
    onSaved();
  }

  if (editing) {
    return (
      <div className="flex flex-col gap-2 rounded-lg border-2 border-blue-300 bg-blue-50 p-3">
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
          <label className="flex flex-col text-sm text-slate-600">
            車種
            <input
              value={vehicleType}
              onChange={(e) => setVehicleType(e.target.value)}
              className="rounded border-2 border-slate-300 px-2 py-1 text-base text-slate-900"
              placeholder="例: 10tダンプ"
            />
          </label>
          <label className="flex flex-col text-sm text-slate-600">
            昼単価
            <input
              value={dayPrice}
              onChange={(e) => setDayPrice(e.target.value)}
              inputMode="numeric"
              className="rounded border-2 border-slate-300 px-2 py-1 text-base text-slate-900"
            />
          </label>
          <label className="flex flex-col text-sm text-slate-600">
            夜単価
            <input
              value={nightPrice}
              onChange={(e) => setNightPrice(e.target.value)}
              inputMode="numeric"
              className="rounded border-2 border-slate-300 px-2 py-1 text-base text-slate-900"
            />
          </label>
          <label className="flex flex-col text-sm text-slate-600">
            その他単価
            <input
              value={otherPrice}
              onChange={(e) => setOtherPrice(e.target.value)}
              inputMode="numeric"
              className="rounded border-2 border-slate-300 px-2 py-1 text-base text-slate-900"
            />
          </label>
          <label className="flex flex-col text-sm text-slate-600">
            適用開始日
            <input
              type="date"
              value={validFrom}
              onChange={(e) => setValidFrom(e.target.value)}
              className="rounded border-2 border-slate-300 px-2 py-1 text-base text-slate-900"
            />
          </label>
          <label className="flex flex-col text-sm text-slate-600">
            適用終了日
            <input
              type="date"
              value={validTo}
              onChange={(e) => setValidTo(e.target.value)}
              className="rounded border-2 border-slate-300 px-2 py-1 text-base text-slate-900"
            />
          </label>
        </div>
        <label className="flex flex-col text-sm text-slate-600">
          備考
          <input
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            className="rounded border-2 border-slate-300 px-2 py-1 text-base text-slate-900"
          />
        </label>
        <div className="flex gap-2">
          <button
            type="button"
            onClick={save}
            className="rounded-md bg-blue-600 px-3 py-2 text-base font-bold text-white"
          >
            保存
          </button>
          <button
            type="button"
            onClick={() => setEditing(false)}
            className="rounded-md bg-slate-200 px-3 py-2 text-base font-bold"
          >
            取消
          </button>
        </div>
      </div>
    );
  }

  return (
    <div
      className={`flex flex-wrap items-center gap-x-4 gap-y-1 rounded-lg border-2 p-3 ${
        price.needsReview ? "border-orange-400 bg-orange-50" : "border-slate-200 bg-white"
      }`}
    >
      {price.needsReview && (
        <span className="rounded-full bg-orange-500 px-2 py-0.5 text-xs font-bold text-white">
          要確認{price.reviewReason ? `：${price.reviewReason}` : ""}
        </span>
      )}
      <span className="font-semibold text-slate-800">{price.vehicleType ?? "車種指定なし"}</span>
      <span className="text-slate-700">昼 {formatPrice(price.dayPrice)}</span>
      <span className="text-slate-700">夜 {formatPrice(price.nightPrice)}</span>
      <span className="text-slate-700">他 {formatPrice(price.otherPrice)}</span>
      {(price.validFrom || price.validTo) && (
        <span className="text-sm text-slate-500">
          適用：{formatDate(price.validFrom) || "―"} 〜 {formatDate(price.validTo) || "現在"}
        </span>
      )}
      {price.notes && <span className="text-sm text-slate-500">備考：{price.notes}</span>}
      <div className="ml-auto flex gap-2">
        {price.needsReview && (
          <button
            type="button"
            onClick={markReviewed}
            className="rounded-md bg-green-200 px-3 py-1 text-sm font-bold"
          >
            確認済みにする
          </button>
        )}
        <button
          type="button"
          onClick={() => setEditing(true)}
          className="rounded-md bg-amber-200 px-3 py-1 text-sm font-bold"
        >
          編集
        </button>
      </div>
    </div>
  );
}
