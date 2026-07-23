-- 配車〜請求書システムのSQLiteスキーマ
-- 設計方針: IT担当者不在・中規模運用(1日10〜30件、取引先10〜50社)のため
-- ORMは使わずシンプルなテーブル構成とする。ただし以下はレビューで指摘され、
-- 妥協せず反映した点:
--   1) 請求書はインボイス制度(適格請求書等保存方式)対応のため、税額・登録番号を
--      「都度計算」ではなく生成時点の値としてinvoicesに固定保存する
--   2) 誰が実績確定・単価修正・請求書発行を行ったかを残す(operator系カラム)
--   3) マスタは物理削除せず is_active による論理削除とする(既存実績の参照整合性を守るため)

-- ---------- 自社情報(請求書発行元・単一行) ----------
CREATE TABLE IF NOT EXISTS company_profile (
    id INTEGER PRIMARY KEY CHECK (id = 1),   -- 1行のみ
    company_name TEXT NOT NULL,
    registration_number TEXT,                 -- インボイス制度の登録番号(T+13桁)
    address TEXT,
    phone TEXT,
    bank_info TEXT
);

-- ---------- 事務員(名前を選ぶだけの簡易ログイン用) ----------
-- パスワードなし。なりすまし防止のための認証ではなく、
-- 「誰が入力したか」を事務員間で確認できる作業ログとしての位置づけ。
CREATE TABLE IF NOT EXISTS staff_members (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL UNIQUE,
    is_active INTEGER NOT NULL DEFAULT 1
);

-- ---------- マスタ ----------
CREATE TABLE IF NOT EXISTS drivers (             -- 運転手マスタ
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL UNIQUE,
    phone TEXT,
    note TEXT,
    is_active INTEGER NOT NULL DEFAULT 1
);

CREATE TABLE IF NOT EXISTS clients (            -- 元請マスタ
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL UNIQUE,
    note TEXT,
    is_active INTEGER NOT NULL DEFAULT 1
);

CREATE TABLE IF NOT EXISTS sites (               -- 地名マスタ(現場名)
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    client_id INTEGER REFERENCES clients(id),
    note TEXT,
    is_active INTEGER NOT NULL DEFAULT 1,
    UNIQUE(name, client_id)
);

CREATE TABLE IF NOT EXISTS vehicles (            -- 車両マスタ(自社車両)
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    plate_no TEXT NOT NULL UNIQUE,
    vehicle_type TEXT,
    default_driver_id INTEGER REFERENCES drivers(id),
    shaken_date TEXT,
    note TEXT,
    is_active INTEGER NOT NULL DEFAULT 1
);

CREATE TABLE IF NOT EXISTS subcontractors (      -- 傭車マスタ
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL UNIQUE,
    contact TEXT,
    note TEXT,
    is_active INTEGER NOT NULL DEFAULT 1
);

CREATE TABLE IF NOT EXISTS prices (              -- 単価表(会社ごとの昼/夜/その他)
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    client_id INTEGER NOT NULL REFERENCES clients(id),
    category TEXT NOT NULL CHECK (category IN ('昼', '夜', 'その他')),
    amount INTEGER,          -- 数値化できる場合のみ設定
    note TEXT,                -- 数値化できない場合の原文備考(日付・電話番号混入など)
    effective_date TEXT,
    updated_by TEXT,          -- 最後に単価を確認・修正した担当者名
    updated_at TEXT NOT NULL DEFAULT (datetime('now', 'localtime')),
    UNIQUE(client_id, category)
);

-- ---------- 配車入力〜実績整理を1本化した表 ----------
CREATE TABLE IF NOT EXISTS dispatch_entries (
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
    category TEXT CHECK (category IN ('昼', '夜', 'その他')),
    quantity REAL,                                  -- 数量H(実績整理時に入力)
    unit_price INTEGER,                             -- 単価(実績整理時に入力・単価表からサジェスト)
    checked INTEGER NOT NULL DEFAULT 0,             -- チェック(済/未)
    memo TEXT,
    status TEXT NOT NULL DEFAULT '予定' CHECK (status IN ('予定', '実績確定')),
    confirmed_by TEXT,                               -- 実績確定を行った担当者名
    confirmed_at TEXT,
    invoice_id INTEGER REFERENCES invoices(id),      -- 請求書に取り込まれたら紐付け
    -- 楽観的排他制御用。updated_at(秒精度)は同一秒内の連続更新を区別できないため、
    -- 更新の度に必ず+1する整数版を使う(複数端末からの同時保存の競合検知に使用)。
    version INTEGER NOT NULL DEFAULT 1,
    created_at TEXT NOT NULL DEFAULT (datetime('now', 'localtime')),
    updated_at TEXT NOT NULL DEFAULT (datetime('now', 'localtime'))
);

-- ---------- 請求書(発行時点の金額・発行元情報を固定保存) ----------
CREATE TABLE IF NOT EXISTS invoices (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    client_id INTEGER NOT NULL REFERENCES clients(id),
    invoice_date TEXT NOT NULL,
    period_start TEXT,
    period_end TEXT,
    -- 発行時点の元請名・登録番号を固定保存(後日マスタが変わっても過去請求書の内容を保つ)
    client_name_snapshot TEXT NOT NULL,
    issuer_name_snapshot TEXT NOT NULL,
    issuer_registration_number_snapshot TEXT,
    subtotal_amount INTEGER NOT NULL,             -- 税抜合計(発行時点で確定・以後不変)
    tax_rate REAL NOT NULL DEFAULT 0.10,
    tax_amount INTEGER NOT NULL,
    total_amount INTEGER NOT NULL,                 -- 税込合計
    xlsx_path TEXT,
    pdf_path TEXT,
    created_by TEXT,                                 -- 発行操作を行った担当者名
    created_at TEXT NOT NULL DEFAULT (datetime('now', 'localtime')),
    -- 会長が「見ました」を押した最新記録のキャッシュ(履歴の正は invoice_review_logs)。
    -- 発行を止める承認ゲートではなく、発行後に会長が内容を把握した記録に過ぎない。
    last_reviewed_by TEXT,
    last_reviewed_at TEXT
);

-- 会長の「見ました」操作を追記専用で残す(1カラム上書きだと「いつ・何回見たか」を失うため)
CREATE TABLE IF NOT EXISTS invoice_review_logs (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    invoice_id INTEGER NOT NULL REFERENCES invoices(id),
    reviewed_by TEXT NOT NULL DEFAULT '会長',
    reviewed_at TEXT NOT NULL DEFAULT (datetime('now', 'localtime'))
);

-- 会長の「ちがう気がする(事務員に伝える)」通知。事務員用トップ画面の赤バッジに使う。
-- 外部通知サービスは運用負荷になるため使わず、DBフラグ+事務員が開いたときの表示のみで完結させる。
CREATE TABLE IF NOT EXISTS staff_alerts (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    target_type TEXT NOT NULL CHECK (target_type IN ('dispatch_day', 'invoice')),
    target_ref TEXT NOT NULL,             -- dispatch_dayならYYYY-MM-DD、invoiceならinvoice_id文字列
    raised_at TEXT NOT NULL DEFAULT (datetime('now', 'localtime')),
    resolved_by TEXT,
    resolved_at TEXT
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
