# -*- coding: utf-8 -*-
"""DBアクセス関数群。小規模運用(1日10〜30件・取引先10〜50社)のため、
ORMは使わずsqlite3を直接ラップするだけに留めている。

設計メモ(レビュー指摘の反映):
- マスタは物理削除せず is_active による論理削除にする(既存の配車実績が
  参照している行を消すと外部キーが壊れるため)。
- update_dispatch_entry は Flask ルートから **request.form 相当のdictを
  渡すことを想定しているため、任意カラムを書けないようホワイトリストで絞る。
- 単価修正・実績確定・請求書発行には operator(担当者名)を必須で残し、
  「誰がいつ確定・修正したか」を追えるようにする。
"""

CATEGORIES = ["昼", "夜", "その他"]

# update_dispatch_entry で更新を許可するカラムのホワイトリスト
_DISPATCH_ENTRY_UPDATABLE_FIELDS = {
    "entry_date", "client_id", "client_name_snapshot", "site_id", "site_name_snapshot",
    "count", "vehicle_id", "driver_id", "is_subcontractor", "subcontractor_id",
    "subcontractor_name_snapshot", "category", "quantity", "unit_price", "checked",
    "memo", "status", "confirmed_by", "confirmed_at", "invoice_id",
}


# ---------- マスタ: 元請 ----------

def list_clients(conn, include_inactive=False):
    if include_inactive:
        return conn.execute("SELECT * FROM clients ORDER BY name").fetchall()
    return conn.execute("SELECT * FROM clients WHERE is_active = 1 ORDER BY name").fetchall()


def get_client(conn, client_id):
    return conn.execute("SELECT * FROM clients WHERE id = ?", (client_id,)).fetchone()


def create_client(conn, name, note=None):
    cur = conn.execute("INSERT INTO clients (name, note) VALUES (?, ?)", (name, note))
    conn.commit()
    return cur.lastrowid


def get_or_create_client(conn, name, note=None):
    """既存なら再利用、なければ作成する冪等な取得関数(初期投入・再実行に安全)。"""
    conn.execute("INSERT OR IGNORE INTO clients (name, note) VALUES (?, ?)", (name, note))
    conn.commit()
    return conn.execute("SELECT id FROM clients WHERE name = ?", (name,)).fetchone()["id"]


def deactivate_client(conn, client_id):
    conn.execute("UPDATE clients SET is_active = 0 WHERE id = ?", (client_id,))
    conn.commit()


# ---------- マスタ: 現場 ----------

def list_sites(conn, client_id=None, include_inactive=False):
    query = "SELECT * FROM sites WHERE 1=1"
    params = []
    if not include_inactive:
        query += " AND is_active = 1"
    if client_id:
        query += " AND client_id = ?"
        params.append(client_id)
    query += " ORDER BY name"
    return conn.execute(query, params).fetchall()


def create_site(conn, name, client_id=None, note=None):
    cur = conn.execute(
        "INSERT INTO sites (name, client_id, note) VALUES (?, ?, ?)", (name, client_id, note)
    )
    conn.commit()
    return cur.lastrowid


def deactivate_site(conn, site_id):
    conn.execute("UPDATE sites SET is_active = 0 WHERE id = ?", (site_id,))
    conn.commit()


# ---------- マスタ: 車両 ----------

def list_vehicles(conn, include_inactive=False):
    if include_inactive:
        return conn.execute("SELECT * FROM vehicles ORDER BY plate_no").fetchall()
    return conn.execute("SELECT * FROM vehicles WHERE is_active = 1 ORDER BY plate_no").fetchall()


def create_vehicle(conn, plate_no, vehicle_type=None, default_driver_id=None, shaken_date=None, note=None):
    cur = conn.execute(
        "INSERT INTO vehicles (plate_no, vehicle_type, default_driver_id, shaken_date, note) "
        "VALUES (?, ?, ?, ?, ?)",
        (plate_no, vehicle_type, default_driver_id, shaken_date, note),
    )
    conn.commit()
    return cur.lastrowid


def deactivate_vehicle(conn, vehicle_id):
    conn.execute("UPDATE vehicles SET is_active = 0 WHERE id = ?", (vehicle_id,))
    conn.commit()


# ---------- マスタ: 運転手 ----------

def list_drivers(conn, include_inactive=False):
    if include_inactive:
        return conn.execute("SELECT * FROM drivers ORDER BY name").fetchall()
    return conn.execute("SELECT * FROM drivers WHERE is_active = 1 ORDER BY name").fetchall()


def create_driver(conn, name, phone=None, note=None):
    cur = conn.execute(
        "INSERT INTO drivers (name, phone, note) VALUES (?, ?, ?)", (name, phone, note)
    )
    conn.commit()
    return cur.lastrowid


def get_or_create_driver(conn, name, phone=None, note=None):
    conn.execute("INSERT OR IGNORE INTO drivers (name, phone, note) VALUES (?, ?, ?)", (name, phone, note))
    conn.commit()
    return conn.execute("SELECT id FROM drivers WHERE name = ?", (name,)).fetchone()["id"]


def deactivate_driver(conn, driver_id):
    conn.execute("UPDATE drivers SET is_active = 0 WHERE id = ?", (driver_id,))
    conn.commit()


# ---------- マスタ: 傭車 ----------

def list_subcontractors(conn, include_inactive=False):
    if include_inactive:
        return conn.execute("SELECT * FROM subcontractors ORDER BY name").fetchall()
    return conn.execute("SELECT * FROM subcontractors WHERE is_active = 1 ORDER BY name").fetchall()


def create_subcontractor(conn, name, contact=None, note=None):
    cur = conn.execute(
        "INSERT INTO subcontractors (name, contact, note) VALUES (?, ?, ?)", (name, contact, note)
    )
    conn.commit()
    return cur.lastrowid


def deactivate_subcontractor(conn, subcontractor_id):
    conn.execute("UPDATE subcontractors SET is_active = 0 WHERE id = ?", (subcontractor_id,))
    conn.commit()


# ---------- 自社情報(請求書発行元・登録番号) ----------

def get_company_profile(conn):
    return conn.execute("SELECT * FROM company_profile WHERE id = 1").fetchone()


def set_company_profile(conn, company_name, registration_number=None, address=None,
                         phone=None, bank_info=None):
    conn.execute(
        """
        INSERT INTO company_profile (id, company_name, registration_number, address, phone, bank_info)
        VALUES (1, ?, ?, ?, ?, ?)
        ON CONFLICT(id) DO UPDATE SET
            company_name = excluded.company_name,
            registration_number = excluded.registration_number,
            address = excluded.address,
            phone = excluded.phone,
            bank_info = excluded.bank_info
        """,
        (company_name, registration_number, address, phone, bank_info),
    )
    conn.commit()


# ---------- 単価表 ----------

def get_prices_for_client(conn, client_id):
    rows = conn.execute(
        "SELECT * FROM prices WHERE client_id = ?", (client_id,)
    ).fetchall()
    by_category = {row["category"]: row for row in rows}
    return [by_category.get(cat) for cat in CATEGORIES]


def list_all_prices(conn):
    return conn.execute(
        "SELECT prices.*, clients.name AS client_name FROM prices "
        "JOIN clients ON clients.id = prices.client_id "
        "ORDER BY clients.name, prices.category"
    ).fetchall()


def upsert_price(conn, client_id, category, amount=None, note=None, effective_date=None, updated_by=None):
    conn.execute(
        """
        INSERT INTO prices (client_id, category, amount, note, effective_date, updated_by, updated_at)
        VALUES (?, ?, ?, ?, ?, ?, datetime('now', 'localtime'))
        ON CONFLICT(client_id, category) DO UPDATE SET
            amount = excluded.amount,
            note = excluded.note,
            effective_date = excluded.effective_date,
            updated_by = excluded.updated_by,
            updated_at = datetime('now', 'localtime')
        """,
        (client_id, category, amount, note, effective_date, updated_by),
    )
    conn.commit()


def get_price(conn, client_id, category):
    return conn.execute(
        "SELECT * FROM prices WHERE client_id = ? AND category = ?", (client_id, category)
    ).fetchone()


# ---------- 配車入力・実績整理 ----------

def create_dispatch_entry(conn, entry_date, client_id=None, client_name_snapshot=None,
                           site_id=None, site_name_snapshot=None, count=None,
                           vehicle_id=None, driver_id=None, is_subcontractor=0,
                           subcontractor_id=None, subcontractor_name_snapshot=None,
                           memo=None, status="予定"):
    cur = conn.execute(
        """
        INSERT INTO dispatch_entries
            (entry_date, client_id, client_name_snapshot, site_id, site_name_snapshot,
             count, vehicle_id, driver_id, is_subcontractor, subcontractor_id,
             subcontractor_name_snapshot, memo, status)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        """,
        (entry_date, client_id, client_name_snapshot, site_id, site_name_snapshot,
         count, vehicle_id, driver_id, is_subcontractor, subcontractor_id,
         subcontractor_name_snapshot, memo, status),
    )
    conn.commit()
    return cur.lastrowid


def list_dispatch_entries(conn, entry_date=None, status=None, client_id=None):
    query = (
        "SELECT dispatch_entries.*, clients.name AS client_name "
        "FROM dispatch_entries LEFT JOIN clients ON clients.id = dispatch_entries.client_id "
        "WHERE 1=1"
    )
    params = []
    if entry_date:
        query += " AND entry_date = ?"
        params.append(entry_date)
    if status:
        query += " AND status = ?"
        params.append(status)
    if client_id:
        query += " AND dispatch_entries.client_id = ?"
        params.append(client_id)
    query += " ORDER BY entry_date, id"
    return conn.execute(query, params).fetchall()


def get_dispatch_entry(conn, entry_id):
    return conn.execute(
        "SELECT * FROM dispatch_entries WHERE id = ?", (entry_id,)
    ).fetchone()


class ConcurrentUpdateError(Exception):
    """expected_version が現在のversionと一致しない場合(他端末が先に更新した場合)に送出する。"""


def update_dispatch_entry(conn, entry_id, expected_version=None, **fields):
    """fields はホワイトリスト(_DISPATCH_ENTRY_UPDATABLE_FIELDS)の範囲でのみ更新を許可する。
    Flaskルートからフォーム値を渡す場合でも任意カラムを書けないようにするための防御。

    expected_version を渡すと楽観的排他制御を行う: 呼び出し側が最後に読み取った
    version と現在のDB上の値が一致する場合のみ更新する(一致しなければ
    ConcurrentUpdateError。他端末が同じ行を先に更新した場合に検知するため)。
    updated_at は秒精度で同一秒内の連続更新を区別できないため使わない。
    """
    if not fields:
        return
    unknown = set(fields) - _DISPATCH_ENTRY_UPDATABLE_FIELDS
    if unknown:
        raise ValueError(f"更新できないカラムです: {sorted(unknown)}")
    set_clause = (
        ", ".join(f"{key} = ?" for key in fields)
        + ", version = version + 1, updated_at = datetime('now', 'localtime')"
    )
    params = list(fields.values()) + [entry_id]
    where = " WHERE id = ?"
    if expected_version is not None:
        where += " AND version = ?"
        params.append(expected_version)
    cur = conn.execute(f"UPDATE dispatch_entries SET {set_clause}{where}", params)
    conn.commit()
    if expected_version is not None and cur.rowcount == 0:
        if get_dispatch_entry(conn, entry_id) is None:
            raise ValueError(f"dispatch_entry {entry_id} が見つかりません")
        raise ConcurrentUpdateError(
            f"dispatch_entry {entry_id} は他の操作で更新済みです。最新の内容を読み込み直してください。"
        )


def confirm_entry_result(conn, entry_id, category, quantity, unit_price, operator, checked=1, memo=None):
    """配車入力を『実績確定』にし、区分・数量・単価・チェック状態・担当者を記録する。"""
    update_dispatch_entry(
        conn, entry_id,
        category=category, quantity=quantity, unit_price=unit_price,
        checked=checked, memo=memo, status="実績確定",
        confirmed_by=operator, confirmed_at=_now_localtime(conn),
    )


def _now_localtime(conn):
    return conn.execute("SELECT datetime('now', 'localtime') AS now").fetchone()["now"]


def list_billable_entries(conn, client_id, period_start, period_end):
    return conn.execute(
        """
        SELECT dispatch_entries.*, clients.name AS client_name
        FROM dispatch_entries
        JOIN clients ON clients.id = dispatch_entries.client_id
        WHERE dispatch_entries.client_id = ?
          AND status = '実績確定'
          AND checked = 1
          AND invoice_id IS NULL
          AND entry_date BETWEEN ? AND ?
        ORDER BY entry_date, id
        """,
        (client_id, period_start, period_end),
    ).fetchall()


# ---------- 請求書 ----------

def create_invoice(conn, client_id, invoice_date, period_start, period_end,
                    client_name_snapshot, issuer_name_snapshot,
                    subtotal_amount, tax_amount, total_amount,
                    issuer_registration_number_snapshot=None, tax_rate=0.10, created_by=None):
    """請求書発行時点の金額・発行元情報をそのままDBに固定保存する。
    後日マスタ(単価・会社名・登録番号)が変わっても、発行済み請求書の内容は変わらない。"""
    cur = conn.execute(
        """
        INSERT INTO invoices
            (client_id, invoice_date, period_start, period_end, client_name_snapshot,
             issuer_name_snapshot, issuer_registration_number_snapshot,
             subtotal_amount, tax_rate, tax_amount, total_amount, created_by)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        """,
        (client_id, invoice_date, period_start, period_end, client_name_snapshot,
         issuer_name_snapshot, issuer_registration_number_snapshot,
         subtotal_amount, tax_rate, tax_amount, total_amount, created_by),
    )
    conn.commit()
    return cur.lastrowid


def set_invoice_files(conn, invoice_id, xlsx_path, pdf_path):
    conn.execute(
        "UPDATE invoices SET xlsx_path = ?, pdf_path = ? WHERE id = ?",
        (xlsx_path, pdf_path, invoice_id),
    )
    conn.commit()


def get_invoice(conn, invoice_id):
    return conn.execute("SELECT * FROM invoices WHERE id = ?", (invoice_id,)).fetchone()


def add_invoice_line(conn, invoice_id, dispatch_entry_id, sort_order, entry_date,
                      display_name, count, quantity, unit_price, amount, vehicle_no, memo):
    conn.execute(
        """
        INSERT INTO invoice_lines
            (invoice_id, dispatch_entry_id, sort_order, entry_date, display_name,
             count, quantity, unit_price, amount, vehicle_no, memo)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        """,
        (invoice_id, dispatch_entry_id, sort_order, entry_date, display_name,
         count, quantity, unit_price, amount, vehicle_no, memo),
    )
    if dispatch_entry_id is not None:
        conn.execute(
            "UPDATE dispatch_entries SET invoice_id = ? WHERE id = ?",
            (invoice_id, dispatch_entry_id),
        )
    conn.commit()


def list_invoice_lines(conn, invoice_id):
    return conn.execute(
        "SELECT * FROM invoice_lines WHERE invoice_id = ? ORDER BY sort_order", (invoice_id,)
    ).fetchall()


def update_invoice_line_display_name(conn, line_id, display_name):
    """請求書明細の名称欄を編集する(「〃」への手動トグルなど)。"""
    conn.execute(
        "UPDATE invoice_lines SET display_name = ? WHERE id = ?", (display_name, line_id)
    )
    conn.commit()


def list_invoices(conn, only_unreviewed=False):
    query = (
        "SELECT invoices.*, clients.name AS client_name FROM invoices "
        "JOIN clients ON clients.id = invoices.client_id"
    )
    if only_unreviewed:
        query += " WHERE last_reviewed_at IS NULL"
    query += " ORDER BY invoices.created_at DESC"
    return conn.execute(query).fetchall()


def list_billing_summary(conn, period_start, period_end):
    """月末締め作業画面用: 取引先ごとの未請求(実績確定・チェック済・未請求)件数を集計する。"""
    return conn.execute(
        """
        SELECT clients.id AS client_id, clients.name AS client_name,
               COUNT(dispatch_entries.id) AS unbilled_count
        FROM clients
        LEFT JOIN dispatch_entries ON dispatch_entries.client_id = clients.id
            AND dispatch_entries.status = '実績確定'
            AND dispatch_entries.checked = 1
            AND dispatch_entries.invoice_id IS NULL
            AND dispatch_entries.entry_date BETWEEN ? AND ?
        WHERE clients.is_active = 1
        GROUP BY clients.id
        ORDER BY unbilled_count DESC, clients.name
        """,
        (period_start, period_end),
    ).fetchall()


# ---------- 会長の「見ました」記録(追記専用ログ + invoices側キャッシュ更新) ----------

def add_invoice_review(conn, invoice_id, reviewed_by="会長"):
    conn.execute(
        "INSERT INTO invoice_review_logs (invoice_id, reviewed_by) VALUES (?, ?)",
        (invoice_id, reviewed_by),
    )
    conn.execute(
        "UPDATE invoices SET last_reviewed_by = ?, last_reviewed_at = datetime('now', 'localtime') "
        "WHERE id = ?",
        (reviewed_by, invoice_id),
    )
    conn.commit()


def list_invoice_reviews(conn, invoice_id):
    return conn.execute(
        "SELECT * FROM invoice_review_logs WHERE invoice_id = ? ORDER BY reviewed_at", (invoice_id,)
    ).fetchall()


# ---------- 会長の「ちがう気がする」通知 ----------

def raise_staff_alert(conn, target_type, target_ref):
    cur = conn.execute(
        "INSERT INTO staff_alerts (target_type, target_ref) VALUES (?, ?)",
        (target_type, target_ref),
    )
    conn.commit()
    return cur.lastrowid


def list_open_staff_alerts(conn):
    return conn.execute(
        "SELECT * FROM staff_alerts WHERE resolved_at IS NULL ORDER BY raised_at"
    ).fetchall()


def get_open_alert_for_target(conn, target_type, target_ref):
    return conn.execute(
        "SELECT * FROM staff_alerts WHERE target_type = ? AND target_ref = ? AND resolved_at IS NULL "
        "ORDER BY raised_at DESC LIMIT 1",
        (target_type, target_ref),
    ).fetchone()


def resolve_staff_alert(conn, alert_id, resolved_by):
    conn.execute(
        "UPDATE staff_alerts SET resolved_by = ?, resolved_at = datetime('now', 'localtime') WHERE id = ?",
        (resolved_by, alert_id),
    )
    conn.commit()


# ---------- 事務員(名前を選ぶだけの簡易ログイン) ----------

def list_staff_members(conn, include_inactive=False):
    if include_inactive:
        return conn.execute("SELECT * FROM staff_members ORDER BY name").fetchall()
    return conn.execute("SELECT * FROM staff_members WHERE is_active = 1 ORDER BY name").fetchall()


def get_or_create_staff_member(conn, name):
    conn.execute("INSERT OR IGNORE INTO staff_members (name) VALUES (?)", (name,))
    conn.commit()
    return conn.execute("SELECT id FROM staff_members WHERE name = ?", (name,)).fetchone()["id"]
