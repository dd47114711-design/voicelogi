"use client";

import { useState } from "react";
import { ClientDto, OrderCategory, SiteDto, WorkCategory } from "@/lib/types";
import { SitePriceRow } from "./SitePriceRow";

const WORK_LABEL: Record<WorkCategory, string> = {
  DOBOKU: "土木",
  UNYU: "運輸",
  HOSO: "舗装",
  SONOTA: "その他",
};

const ORDER_LABEL: Record<OrderCategory, string> = {
  KOKYO: "公共",
  MINKAN: "民間",
  FUMEI: "不明",
};

function siteNeedsReview(site: SiteDto) {
  return site.needsReview || site.prices.some((p) => p.needsReview);
}

export function SiteAdmin({
  initialSites,
  clients,
}: {
  initialSites: SiteDto[];
  clients: ClientDto[];
}) {
  const [sites, setSites] = useState(initialSites);
  const [query, setQuery] = useState("");
  const [searching, setSearching] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const [newClientId, setNewClientId] = useState(clients[0]?.id ?? "");
  const [newName, setNewName] = useState("");
  const [newWork, setNewWork] = useState<WorkCategory>("DOBOKU");
  const [newOrder, setNewOrder] = useState<OrderCategory>("FUMEI");

  async function refresh(q = query) {
    setSearching(true);
    const res = await fetch(`/api/sites${q ? `?q=${encodeURIComponent(q)}` : ""}`);
    const data = await res.json();
    setSites(data.sites);
    setSearching(false);
  }

  async function handleSearch(value: string) {
    setQuery(value);
    await refresh(value);
  }

  async function handleAddSite() {
    const name = newName.trim();
    if (!newClientId || name.length === 0) return;
    const res = await fetch("/api/sites", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        clientId: newClientId,
        name,
        workCategory: newWork,
        orderCategory: newOrder,
      }),
    });
    if (!res.ok) {
      setErrorMessage("現場の追加に失敗しました");
      return;
    }
    setNewName("");
    await refresh();
  }

  async function handleAddPrice(siteId: string) {
    const res = await fetch(`/api/sites/${siteId}/prices`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({}),
    });
    if (!res.ok) {
      setErrorMessage("単価の追加に失敗しました");
      return;
    }
    await refresh();
  }

  async function handleMarkSiteReviewed(siteId: string) {
    const res = await fetch(`/api/sites/${siteId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ reviewed: true }),
    });
    if (!res.ok) {
      setErrorMessage("確認済みへの変更に失敗しました");
      return;
    }
    await refresh();
  }

  const reviewSites = sites.filter(siteNeedsReview);
  const normalSites = sites.filter((s) => !siteNeedsReview(s));

  return (
    <div className="mx-auto max-w-4xl px-4 py-6">
      {errorMessage && (
        <div
          className="mb-4 rounded-xl border-4 border-red-400 bg-red-50 p-4 text-lg font-bold text-red-700"
          onClick={() => setErrorMessage(null)}
        >
          {errorMessage}（タップで閉じる）
        </div>
      )}

      <section className="mb-6 rounded-2xl border-4 border-slate-300 bg-white p-4">
        <input
          type="text"
          value={query}
          onChange={(e) => handleSearch(e.target.value)}
          placeholder="取引先名・現場名・区分・車種・備考で検索"
          className="w-full rounded-lg border-2 border-slate-300 px-4 py-3 text-xl"
        />
        {searching && <p className="mt-1 text-sm text-slate-400">検索中…</p>}
      </section>

      <section className="mb-8 rounded-2xl border-4 border-slate-300 bg-white p-4">
        <h2 className="mb-3 text-xl font-bold text-slate-800">現場を追加</h2>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <label className="flex flex-col text-sm text-slate-600">
            取引先
            <select
              value={newClientId}
              onChange={(e) => setNewClientId(e.target.value)}
              className="rounded-lg border-2 border-slate-300 px-3 py-2 text-lg text-slate-900"
            >
              {clients.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </select>
          </label>
          <label className="flex flex-col text-sm text-slate-600">
            現場名
            <input
              value={newName}
              onChange={(e) => setNewName(e.target.value)}
              className="rounded-lg border-2 border-slate-300 px-3 py-2 text-lg text-slate-900"
            />
          </label>
          <label className="flex flex-col text-sm text-slate-600">
            業務区分
            <select
              value={newWork}
              onChange={(e) => setNewWork(e.target.value as WorkCategory)}
              className="rounded-lg border-2 border-slate-300 px-3 py-2 text-lg text-slate-900"
            >
              {Object.entries(WORK_LABEL).map(([value, label]) => (
                <option key={value} value={value}>
                  {label}
                </option>
              ))}
            </select>
          </label>
          <label className="flex flex-col text-sm text-slate-600">
            発注区分
            <select
              value={newOrder}
              onChange={(e) => setNewOrder(e.target.value as OrderCategory)}
              className="rounded-lg border-2 border-slate-300 px-3 py-2 text-lg text-slate-900"
            >
              {Object.entries(ORDER_LABEL).map(([value, label]) => (
                <option key={value} value={value}>
                  {label}
                </option>
              ))}
            </select>
          </label>
        </div>
        <button
          type="button"
          onClick={handleAddSite}
          disabled={clients.length === 0}
          className="mt-3 rounded-lg bg-blue-600 px-6 py-2 text-lg font-bold text-white active:scale-95 transition-transform disabled:opacity-40"
        >
          追加
        </button>
        {clients.length === 0 && (
          <p className="mt-2 text-sm text-red-600">
            先に取引先マスターで取引先を登録してください。
          </p>
        )}
      </section>

      {reviewSites.length > 0 && (
        <section className="mb-8 rounded-2xl border-4 border-orange-400 bg-orange-50 p-4">
          <h2 className="mb-3 text-xl font-bold text-orange-800">
            要確認の現場（{reviewSites.length}件）
          </h2>
          <div className="flex flex-col gap-4">
            {reviewSites.map((site) => (
              <SiteCard
                key={site.id}
                site={site}
                onAddPrice={handleAddPrice}
                onMarkReviewed={handleMarkSiteReviewed}
                onSaved={refresh}
                onError={setErrorMessage}
              />
            ))}
          </div>
        </section>
      )}

      <section className="rounded-2xl border-4 border-slate-300 bg-white p-4">
        <h2 className="mb-3 text-xl font-bold text-slate-800">
          現場一覧（{normalSites.length}件）
        </h2>
        <div className="flex flex-col gap-4">
          {normalSites.map((site) => (
            <SiteCard
              key={site.id}
              site={site}
              onAddPrice={handleAddPrice}
              onMarkReviewed={handleMarkSiteReviewed}
              onSaved={refresh}
              onError={setErrorMessage}
            />
          ))}
          {normalSites.length === 0 && (
            <p className="text-slate-400">該当する現場がありません</p>
          )}
        </div>
      </section>
    </div>
  );
}

function SiteCard({
  site,
  onAddPrice,
  onMarkReviewed,
  onSaved,
  onError,
}: {
  site: SiteDto;
  onAddPrice: (siteId: string) => void;
  onMarkReviewed: (siteId: string) => void;
  onSaved: () => void;
  onError: (message: string) => void;
}) {
  return (
    <div
      className={`rounded-xl border-2 p-3 ${
        siteNeedsReview(site) ? "border-orange-300 bg-white" : "border-slate-200 bg-white"
      }`}
    >
      <div className="mb-2 flex flex-wrap items-center gap-2">
        {site.needsReview && (
          <span className="rounded-full bg-orange-500 px-2 py-0.5 text-xs font-bold text-white">
            要確認{site.reviewReason ? `：${site.reviewReason}` : ""}
          </span>
        )}
        <span className="text-lg font-bold text-slate-900">{site.client.name}</span>
        <span className="text-lg text-slate-700">／ {site.name}</span>
        <span className="rounded bg-violet-100 px-2 py-0.5 text-sm font-semibold text-violet-800">
          {WORK_LABEL[site.workCategory]}
        </span>
        <span className="rounded bg-teal-100 px-2 py-0.5 text-sm font-semibold text-teal-800">
          {ORDER_LABEL[site.orderCategory]}
        </span>
        {site.needsReview && (
          <button
            type="button"
            onClick={() => onMarkReviewed(site.id)}
            className="ml-auto rounded-md bg-green-200 px-3 py-1 text-sm font-bold"
          >
            現場を確認済みにする
          </button>
        )}
      </div>
      {site.notes && <p className="mb-2 text-sm text-slate-500">備考：{site.notes}</p>}

      <div className="flex flex-col gap-2">
        {site.prices.map((price) => (
          <SitePriceRow key={price.id} price={price} onSaved={onSaved} onError={onError} />
        ))}
        {site.prices.length === 0 && (
          <p className="text-sm text-slate-400">単価未登録</p>
        )}
      </div>
      <button
        type="button"
        onClick={() => onAddPrice(site.id)}
        className="mt-2 rounded-md bg-slate-200 px-3 py-2 text-sm font-bold"
      >
        ＋ 単価を追加
      </button>
    </div>
  );
}
