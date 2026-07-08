# -*- coding: utf-8 -*-
"""DBアクセス関数群。小規模運用(1日10〜30件・取引先10〜50社)のため、
ORMは使わずsqlite3を直接ラップするだけに留めている。"""

CATEGORIES = ["昼", "夜", "その他"]


# ---------- マスタ: 元請 ----------

def list_clients(conn):
    return conn.execute("SELECT * FROM clients ORDER BY name").fetchall()


def get_client(conn, client_id):
    return conn.execute("SELECT * FROM clients WHERE id = ?", (client_id,)).fetchone()


def create_client(conn, name, note=None):
    cur = conn.execute("INSERT INTO clients (name, note) VALUES (?, ?)", (name, note))
    conn.commit()
    return cur.lastrowid


# ---------- マスタ: 現場 ----------

def list_sites(conn, client_id=None):
    if client_id:
        return conn.execute(
            "SELECT * FROM sites WHERE client_id = ? ORDER BY name", (client_id,)
        ).fetchall()
    return conn.execute("SELECT * FROM sites ORDER BY name").fetchall()


def create_site(conn, name, client_id=None, note=None):
    cur = conn.execute(
        "INSERT INTO sites (name, client_id, note) VALUES (?, ?, ?)", (name, client_id, note)
    )
    conn.commit()
    return cur.lastrowid


# ---------- マスタ: 車両 ----------

def list_vehicles(conn):
    return conn.execute("SELECT * FROM vehicles ORDER BY plate_no").fetchall()


def create_vehicle(conn, plate_no, vehicle_type=None, default_driver_id=None, shaken_date=None, note=None):
    cur = conn.execute(
        "INSERT INTO vehicles (plate_no, vehicle_type, default_driver_id, shaken_date, note) "
        "VALUES (?, ?, ?, ?, ?)",
        (plate_no, vehicle_type, default_driver_id, shaken_date, note),
    )
    conn.commit()
    return cur.lastrowid


# ---------- マスタ: 運転手 ----------

def list_drivers(conn):
    return conn.execute("SELECT * FROM drivers ORDER BY name").fetchall()


def create_driver(conn, name, phone=None, note=None):
    cur = conn.execute(
        "INSERT INTO drivers (name, phone, note) VALUES (?, ?, ?)", (name, phone, note)
    )
    conn.commit()
    return cur.lastrowid


# ---------- マスタ: 傭車 ----------

def list_subcontractors(conn):
    return conn.execute("SELECT * FROM subcontractors ORDER BY name").fetchall()


def create_subcontractor(conn, name, contact=None, note=None):
    cur = conn.execute(
        "INSERT INTO subcontractors (name, contact, note) VALUES (?, ?, ?)", (name, contact, note)
    )
    conn.commit()
    return cur.lastrowid


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


def upsert_price(conn, client_id, category, amount=None, note=None, effective_date=None):
    conn.execute(
        """
        INSERT INTO prices (client_id, category, amount, note, effective_date)
        VALUES (?, ?, ?, ?, ?)
        ON CONFLICT(client_id, category) DO UPDATE SET
            amount = excluded.amount,
            note = excluded.note,
            effective_date = excluded.effective_date
        """,
        (client_id, category, amount, note, effective_date),
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


def update_dispatch_entry(conn, entry_id, **fields):
    if not fields:
        return
    set_clause = ", ".join(f"{key} = ?" for key in fields) + ", updated_at = datetime('now')"
    params = list(fields.values()) + [entry_id]
    conn.execute(f"UPDATE dispatch_entries SET {set_clause} WHERE id = ?", params)
    conn.commit()


def confirm_entry_result(conn, entry_id, category, quantity, unit_price, checked=1, memo=None):
    """配車入力を『実績確定』にし、区分・数量・単価・チェック状態を記録する。"""
    update_dispatch_entry(
        conn, entry_id,
        category=category, quantity=quantity, unit_price=unit_price,
        checked=checked, memo=memo, status="実績確定",
    )


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

def create_invoice(conn, client_id, invoice_date, period_start, period_end):
    cur = conn.execute(
        "INSERT INTO invoices (client_id, invoice_date, period_start, period_end) VALUES (?, ?, ?, ?)",
        (client_id, invoice_date, period_start, period_end),
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
