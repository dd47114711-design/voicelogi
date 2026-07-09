# -*- coding: utf-8 -*-
"""手動での起動確認前に、主要な画面・APIが一通り動くことを機械的に確認する
使い捨てスクリプト(pytestの正式なテストスイートはTask #7で別途整備する)。
実行方法: python3 scripts/smoke_test.py
"""
import os
import sys

sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))

from app import create_app  # noqa: E402


def check(label, condition):
    status = "OK" if condition else "NG"
    print(f"[{status}] {label}")
    if not condition:
        raise SystemExit(1)


def main():
    app = create_app()
    client = app.test_client()

    # ログインなしでトップにアクセス -> ログイン画面へリダイレクト
    r = client.get("/")
    check("未ログインで/にアクセスするとリダイレクトされる", r.status_code == 302)

    r = client.get("/login")
    check("ログイン画面が開く", r.status_code == 200 and "名前を選んでください".encode() in r.data)

    r = client.post("/login", data={"name": "テスト事務員"}, follow_redirects=True)
    check("名前を選んでログインできる", r.status_code == 200)

    r = client.get("/")
    check("ログイン後トップが開く", r.status_code == 200)

    r = client.get("/dispatch?date=2026-07-08")
    check("配車入力グリッドが開く", r.status_code == 200 and "配車入力".encode() in r.data)

    # クライアント一覧を取得して先頭のIDで行更新をテスト
    from app.db import get_connection
    from app import models
    conn = get_connection()
    client_row = models.list_clients(conn)[0]

    r = client.get("/dispatch?date=2026-07-08")
    entries = models.list_dispatch_entries(conn, entry_date="2026-07-08")
    check("配車入力を開くと空行が自動作成される", len(entries) >= 1)
    entry = entries[0]

    r = client.post(
        f"/dispatch/entries/{entry['id']}/update",
        json={"fields": {"client_id": client_row["id"], "count": 2}, "expected_version": entry["version"]},
    )
    check("配車行の自動下書き保存(update)が成功する", r.status_code == 200 and r.get_json()["ok"])

    r_stale = client.post(
        f"/dispatch/entries/{entry['id']}/update",
        json={"fields": {"count": 5}, "expected_version": entry["version"]},
    )
    check("古いversionでの更新は409で拒否される", r_stale.status_code == 409)

    r = client.post("/dispatch/entries", data={"entry_date": "2026-07-08"})
    check("行の追加(フラグメント返却)が成功する", r.status_code == 200 and b"dispatch-row" in r.data)

    entries2 = models.list_dispatch_entries(conn, entry_date="2026-07-08")
    new_entry_id = entries2[-1]["id"]
    r = client.post(f"/dispatch/entries/{new_entry_id}/duplicate")
    check("行の複製が成功する", r.status_code == 200 and b"dispatch-row" in r.data)

    r = client.post("/masters/quick-add/clients", json={"name": "テスト新規元請"})
    check("マスタのクイック追加が成功する", r.status_code == 200 and r.get_json().get("name") == "テスト新規元請")

    # 現場マスタ: 元請ごとのクイック追加・カスケード絞り込み・重複排除
    client2 = models.list_clients(conn)[2]
    r = client.post("/masters/quick-add/sites", json={"name": "テスト現場A", "client_id": client_row["id"]})
    site_a = r.get_json()
    check(
        "現場のクイック追加(元請あり)が成功する",
        r.status_code == 200 and site_a.get("name") == "テスト現場A" and site_a.get("client_id") == client_row["id"],
    )

    r = client.post("/masters/quick-add/sites", json={"name": "テスト現場A", "client_id": client2["id"]})
    site_a_other = r.get_json()
    check(
        "同名でも元請が違えば別レコードとして作成される",
        site_a_other.get("id") != site_a.get("id"),
    )

    r = client.post("/masters/quick-add/sites", json={"name": "テスト現場B(元請未設定)"})
    site_unassigned = r.get_json()
    check(
        "現場のクイック追加(元請未設定)が成功する",
        r.status_code == 200 and site_unassigned.get("client_id") is None,
    )
    id_dup1 = models.get_or_create_site(conn, "テスト現場B(元請未設定)", client_id=None)
    check(
        "元請未設定の現場を2回作っても重複しない(get_or_create_siteのNULL対応)",
        id_dup1 == site_unassigned["id"],
    )

    r = client.post(
        f"/dispatch/entries/{entry['id']}/update",
        json={"fields": {"site_id": site_a["id"]}, "expected_version": entry["version"] + 1},
    )
    check("配車行にsite_idを保存できる", r.status_code == 200 and r.get_json()["ok"])
    entry_with_site = models.get_dispatch_entry(conn, entry["id"])
    check(
        "site_id保存時にsite_name_snapshotがサーバー側で自動生成される",
        entry_with_site["site_id"] == site_a["id"] and entry_with_site["site_name_snapshot"] == "テスト現場A",
    )

    r = client.post(f"/dispatch/entries/{entry['id']}/duplicate")
    duplicated_html = r.data
    check("複製時にsite_idも複製される", (f'value="{site_a["id"]}"'.encode()) in duplicated_html)

    r = client.get("/masters")
    check("マスタ管理に現場マスタが表示される", r.status_code == 200 and "現場マスタ".encode() in r.data)

    # 実績確定 -> 請求書作成の一連の流れ
    models.confirm_entry_result(
        conn, entry["id"], category="昼", quantity=8.0, unit_price=38000, operator="テスト事務員",
    )
    r = client.get(f"/billing?client_id={client_row['id']}&period_start=2026-07-01&period_end=2026-07-08")
    check("実績整理画面が開く", r.status_code == 200)

    r = client.get(
        f"/invoices/new?client_id={client_row['id']}&period_start=2026-07-01&period_end=2026-07-08"
    )
    check("請求書プレビュー(作成前)が開く", r.status_code == 200)

    r = client.post(
        "/invoices",
        data={"client_id": client_row["id"], "period_start": "2026-07-01", "period_end": "2026-07-08"},
        follow_redirects=True,
    )
    check("請求書が発行できる", r.status_code == 200 and "請求書プレビュー".encode() in r.data)

    invoices = models.list_invoices(conn)
    check("invoicesテーブルにレコードが作られている", len(invoices) >= 1)
    invoice = invoices[0]
    check("xlsx/pdfが生成されている", invoice["xlsx_path"] and invoice["pdf_path"]
          and os.path.exists(invoice["xlsx_path"]) and os.path.exists(invoice["pdf_path"]))

    lines = models.list_invoice_lines(conn, invoice["id"])
    if lines:
        r = client.post(f"/invoices/{invoice['id']}/lines/{lines[0]['id']}/toggle-dash", follow_redirects=True)
        check("「〃」トグルが成功する", r.status_code == 200)

    r = client.get(f"/invoices/{invoice['id']}/download.xlsx")
    check("Excelダウンロードが成功する", r.status_code == 200)
    r = client.get(f"/invoices/{invoice['id']}/download.pdf")
    check("PDFダウンロードが成功する", r.status_code == 200)

    r = client.get("/invoices/closing")
    check("月末締め作業画面が開く", r.status_code == 200)

    r = client.get("/prices")
    check("単価表画面が開く", r.status_code == 200)
    r = client.get("/prices/needs-review")
    check("単価 要確認一覧が開く", r.status_code == 200 and b"TEL" in r.data)

    r = client.get("/masters")
    check("マスタ管理画面が開く", r.status_code == 200)

    r = client.post("/masters/company", data={"company_name": "テスト運送株式会社", "registration_number": "T1234567890123"})
    check("自社情報の保存が成功する", r.status_code in (200, 302))

    # 会長用画面(ログイン不要)
    r = client.get("/chairman/")
    check("会長トップが開く", r.status_code == 200 and "今日の配車を見る".encode() in r.data)
    check("会長トップに事務員へのリンクが含まれない", b"/login" not in r.data and b"masters" not in r.data)

    r = client.get("/chairman/today")
    check("会長『今日の配車を見る』が開く", r.status_code == 200)

    r = client.get("/chairman/invoices")
    check("会長『請求書の確認』一覧が開く", r.status_code == 200)

    r = client.post(f"/chairman/invoices/{invoice['id']}/review", follow_redirects=True)
    check("会長の『見ました』記録が成功する", r.status_code == 200 and "確認しました".encode() in r.data)

    invoice_after = models.get_invoice(conn, invoice["id"])
    check("invoices.last_reviewed_byが記録される", invoice_after["last_reviewed_by"] == "会長")

    r = client.post("/chairman/today/alert", follow_redirects=True)
    check("会長の『ちがう気がする』(配車)が成功する", r.status_code == 200 and "事務員に伝えました".encode() in r.data)

    r = client.get("/")
    check("事務員トップに会長からの連絡バッジが表示される", "会長からの連絡".encode() in r.data)

    conn.close()
    print("\n全項目OK")


if __name__ == "__main__":
    main()
