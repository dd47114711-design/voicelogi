# 設計: Supabase接続とDBスキーマ作成（初期化issue）

- 日付: 2026-08-25
- 対象: 新実装（Next.js + Supabase）の最初のissue
- 関連: CLAUDE.md, webapp/README.md, docs/deployment-decision-2026-08-05.md

## 背景・経緯

- `webapp/` は旧実装（localStorage）。新実装はまだリポジトリに存在しない。
- CLAUDE.mdは技術スタックとしてDrizzle ORM・Vercelデプロイを前提に書かれていたが、
  `docs/deployment-decision-2026-08-05.md`（2026-08-05時点の決定）でVercel不採用・
  事務所LAN内運用・Supabase採用は「未決定」に変更されていた。
- 本セッションでの本人との対話により、以下の通り**最終決定**した（CLAUDE.md記載内容から
  意図的に逸脱する箇所は、本人の直接指示による）。

## 決定事項

| 項目 | 決定 | 補足 |
| --- | --- | --- |
| DB | Supabase Postgres（プロジェクト「ボイスロジ」、既存） | オフライン時に配車盤が止まるリスクは許容 |
| デプロイ | Vercel（Pro プラン） | `docs/deployment-decision-2026-08-05.md` のLAN内運用方針は撤回。Hobbyは商用利用不可のためProが必要 |
| DBアクセス | ORM無し。Server Actions内で `supabase-js` を直接使用 | CLAUDE.mdのDrizzle方針から変更（本人指示） |
| スキーマ管理 | `supabase/migrations/*.sql` をgit管理し `supabase db push` で適用 | ダッシュボードでの手動変更はしない方針は維持 |
| UI | 今回はshadcn/ui導入せず、素のTailwindで暫定実装 | 本UIUXは別途指示予定 |
| RLS | 有効化するが、当面は全許可ポリシー | 認証方式（Supabase Auth前提かLAN内前提か）が未決のため、後で締める |

上記以外（Next.js 16 App Router、TypeScript strict、pnpm、Server Component既定、
DBフェッチ1単位=1コンポーネント=1 Suspense境界などのCLAUDE.md記載の規約）はそのまま踏襲する。

## 今回のissueでやること

1. `webapp/` `scripts/` `output/` を `legacy/` へ退避
2. リポジトリ直下にNext.js 16 + TypeScript + Tailwindの最小雛形を作成（shadcn無し、画面はまだ作らない）
3. `npx supabase login` / `npx supabase link` でプロジェクト「ボイスロジ」に接続し、
   接続情報を `.env.local`（gitignore対象）に設定
4. 下記スキーマのマイグレーションSQLを作成し、`supabase db push` で実テーブルを作成
5. 全テーブルでRLSを有効化し、暫定の全許可ポリシーを設定
6. 接続確認用の最小Server Action（例: staff件数を返すだけ）を1つ用意して疎通確認
7. `docs/deployment-decision-2026-08-05.md` にVercel採用への変更を追記

### 今回やらないこと（別issue）

- 配車盤・出退勤UIの実装（本UIUXは別途指示）
- 音声配車入力（`voice_parse`）用テーブル・機能（解析方式=ルールベース/LLMが未決定）
- 認証（Supabase Auth）の実装、RLSの本締め
- Realtimeによる複数端末同期の実装

## スキーマ設計

### 設計方針

CLAUDE.mdの不変条件のうち、旧実装（`webapp/`）のフラットなデータ構造では表現しきれない
ものがある。特に「現場名でグルーピングしない。配置枠IDを介して分類する」「同じ現場に
複数の配置枠が同時に存在しうる（フェアロード①②③）」を満たすため、**配置枠
（`placement_slots`）を独立エンティティとして新設**する（旧実装からの意図的な再設計）。

「空車」「稼働中人数」などの集計値は保存せず、常にクエリ時に導出する
（旧実装の「集計結果を保存しない」不変条件を踏襲）。

### テーブル

```
staff（人員マスタ）
  id                 uuid PK
  name               text not null
  department         text not null check (department in ('土木','運輸'))
  normal_vehicle_id  uuid FK -> vehicles.id, null可（通常ダンプ）
  display_order      integer not null default 0
  active             boolean not null default true
  retired_at         timestamptz null（退職。削除しない）
  created_at         timestamptz not null default now()

vehicles（車両マスタ）
  id             uuid PK
  display_name   text not null
  vehicle_number text not null
  vehicle_type   text not null
  status         text not null default '使用可能'
                   check (status in ('使用可能','整備','車検','故障','使用停止'))
  display_order  integer not null default 0
  active         boolean not null default true
  created_at     timestamptz not null default now()

sites（現場マスタ）
  id             uuid PK
  name           text not null
  category       text not null check (category in ('土木','運輸','共通'))
  active         boolean not null default true
  display_order  integer not null default 0
  usage_count    integer not null default 0
  created_at     timestamptz not null default now()

placement_slots（配置枠。同一現場に複数行あり得る）
  id         uuid PK
  site_id    uuid FK -> sites.id, not null
  opened_at  timestamptz not null default now()
  ended_at   timestamptz null（null = 稼働中。終了しても削除しない）

staff_placements（人の現在の配置。1人1行）
  staff_id            uuid PK/FK -> staff.id
  slot_id             uuid FK -> placement_slots.id, null可（null = 現場未定/休みは出退勤側で判定）
  assigned_vehicle_id uuid FK -> vehicles.id, null可（当日ダンプ。部門をまたぐ乗車を含む）
  updated_at          timestamptz not null default now()

vehicle_placements（車両の現在の配置。1台1行）
  vehicle_id  uuid PK/FK -> vehicles.id
  slot_id     uuid FK -> placement_slots.id, null可（null = 空車/整備/駐車先未定）
  updated_at  timestamptz not null default now()

attendance_events（出退勤イベントログ。追記専用、上書き・削除しない）
  id          uuid PK
  staff_id    uuid FK -> staff.id, not null
  action      text not null check (action in ('clockIn','clockOut'))
  occurred_at timestamptz not null
  created_at  timestamptz not null default now()
```

### 不変条件との対応

- 二重配置防止: `staff_placements.staff_id` と `vehicle_placements.vehicle_id` は
  それぞれPK（=一意）なので、1人・1台は必ず1行しか持てない。
- 通常ダンプと当日ダンプの分離: `staff.normal_vehicle_id`（恒常）と
  `staff_placements.assigned_vehicle_id`（当日、部門またぎ含む）を別カラムに分離。
- 出退勤は配置を動かさない: `attendance_events` は `staff_placements` と無関係の
  独立テーブル。出退勤の記録・集計はここから都度計算し、集計結果は保存しない。
- 部門横断: `staff.department`（本人の基本所属）と、当日の配置枠の部門
  （`placement_slots.site_id -> sites.category` 経由）は別物として扱える。
- 原則削除しない: `staff.active`/`retired_at`、`vehicles.active`、`sites.active`、
  `placement_slots.ended_at` で状態管理し、行自体は削除しない。

## RLS方針（暫定）

全テーブルでRLSを有効化した上で、`authenticated` および `anon` ロールに対して
`select`/`insert`/`update` を許可する暫定ポリシーを設定する（`delete` は許可しない、
不変条件「原則削除しない」に合わせる）。認証方式が確定した時点でポリシーを見直す。

## 動作確認方法

- `supabase db push` 後、Supabaseダッシュボードでテーブルとカラムを目視確認
- Next.js側に最小のServer Action（例: `getStaffCount()`）を1つ実装し、
  ローカルで `pnpm dev` して疎通を確認（画面はまだ無いので、動作確認用の
  一時ページ or ターミナルログで確認）
- 二重配置防止の一意制約が効くこと（同じstaff_idを2回insertしようとしてエラーになること）を
  簡単な確認クエリで確認

## 未決定のまま残る事項（このissueでは扱わない）

- 認証方式（Supabase Auth vs 別方式）とRLS本締め
- Realtimeによる複数端末同期の実装方法
- 音声配車入力のテーブル設計・解析方式（ルールベース/LLM）
