-- 配車〜請求書システムのSQLiteスキーマ

CREATE TABLE IF NOT EXISTS clients (            -- 元請マスタ
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL UNIQUE,
    note TEXT
);

CREATE TABLE IF NOT EXISTS sites (               -- 地名マスタ(現場名)
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    client_id INTEGER REFERENCES clients(id),
    note TEXT,
    UNIQUE(name, client_id)
);

CREATE TABLE IF NOT EXISTS vehicles (            -- 車両マスタ(自社車両)
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    plate_no TEXT NOT NULL UNIQUE,
    vehicle_type TEXT,
    default_driver_id INTEGER REFERENCES drivers(id),
    shaken_date TEXT,
    note TEXT
);

CREATE TABLE IF NOT EXISTS drivers (             -- 運転手マスタ
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL UNIQUE,
    phone TEXT,
    note TEXT
);

CREATE TABLE IF NOT EXISTS subcontractors (      -- 傭車マスタ
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL UNIQUE,
    contact TEXT,
    note TEXT
);

CREATE TABLE IF NOT EXISTS prices (              -- 単価表(会社ごとの昼/夜/その他)
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    client_id INTEGER NOT NULL REFERENCES clients(id),
    category TEXT NOT NULL CHECK (category IN ('昼', '夜', 'その他')),
    amount INTEGER,          -- 数値化できる場合のみ設定
    note TEXT,                -- 数値化できない場合の原文備考(日付・電話番号混入など)
    effective_date TEXT,
    UNIQUE(client_id, category)
);

CREATE TABLE IF NOT EXISTS dispatch_entries (    -- 配車入力〜実績整理を1本化した表
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    entry_date TEXT NOT NULL,                    -- YYYY-MM-DD
    client_id INTEGER REFERENCES clients(id),
    client_name_snapshot TEXT,                    -- 元請名(4t車など表記ゆれをそのまま保持)
    site_id INTEGER REFERENCES sites(id),
    site_name_snapshot TEXT,
    count INTEGER,                                 -- 台数
    vehicle_id INTEGER REFERENCES vehicles(id),    -- 自社車番
    driver_id INTEGER REFERENCES drivers(id),      -- 運転手
    is_subcontractor INTEGER NOT NULL DEFAULT 0,   -- 0=自社 1=傭車
    subcontractor_id INTEGER REFERENCES subcontractors(id),
    subcontractor_name_snapshot TEXT,
    category TEXT CHECK (category IN ('昼', '夜', 'その他', NULL)),
    quantity REAL,                                  -- 数量H(実績整理時に入力)
    unit_price INTEGER,                             -- 単価(実績整理時に入力・単価表からサジェスト)
    checked INTEGER NOT NULL DEFAULT 0,             -- チェック(済/未)
    memo TEXT,
    status TEXT NOT NULL DEFAULT '予定' CHECK (status IN ('予定', '実績確定')),
    invoice_id INTEGER REFERENCES invoices(id),      -- 請求書に取り込まれたら紐付け
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS invoices (             -- 生成済み請求書
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    client_id INTEGER NOT NULL REFERENCES clients(id),
    invoice_date TEXT NOT NULL,
    period_start TEXT,
    period_end TEXT,
    xlsx_path TEXT,
    pdf_path TEXT,
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS invoice_lines (        -- 請求書明細(表示名の「〃」トグルなど編集内容を保持)
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    invoice_id INTEGER NOT NULL REFERENCES invoices(id),
    dispatch_entry_id INTEGER REFERENCES dispatch_entries(id),
    sort_order INTEGER NOT NULL DEFAULT 0,
    entry_date TEXT,
    display_name TEXT,        -- 名称欄。「〃」表示にする場合はこの値を "〃" にする
    count INTEGER,
    quantity REAL,
    unit_price INTEGER,
    amount INTEGER,
    vehicle_no TEXT,
    memo TEXT
);

CREATE INDEX IF NOT EXISTS idx_dispatch_entries_date ON dispatch_entries(entry_date);
CREATE INDEX IF NOT EXISTS idx_dispatch_entries_status ON dispatch_entries(status);
CREATE INDEX IF NOT EXISTS idx_dispatch_entries_client ON dispatch_entries(client_id);
