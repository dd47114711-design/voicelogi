# 設計: 配車・出退勤ボードの盤面表示（読み取り専用）

- 日付: 2026-08-25
- 対象: GitHub issue #5
- 関連: CLAUDE.md, legacy/webapp/README.md, docs/superpowers/specs/2026-08-25-supabase-db-setup-design.md

## 背景・経緯

legacy/webapp（素のHTML/CSS/JS + localStorage）で実運用してきた配車・出退勤ボードを、
Next.js + Supabaseで作り直している。DBスキーマは`supabase/migrations/`に移行済み（マスタ
データ投入は別セッションで進行中）。フロント/バックエンドの実装はまだほぼ手つかず
（`components/staff-count.tsx`という疎通確認用POCが1つあるのみ）。

移植対象の機能は1つの巨大issueにせず、サブプロジェクトに分解して進める。今回はその
第1弾として、書き込み系操作（配車登録・出退勤打刻など）より先に**盤面表示（読み取り
専用）**を土台として作る。理由は、他の全機能（配車登録・変更・車両状態変更）がこの
表示の上に「操作を足す」形になるため、先に固めておくと後工程がぶれないこと。

## スコープ

legacy/webapp/README.mdの「画面構成」章に準拠し、以下を実装する。

- 現場グループの3カラム表示（左: 運転手/作業員名札、中央: 現場名札、右: ダンプ札）
- 運輸部門ヘッダーの車両集計（使用中/空車/整備/車検/故障/使用停止/合計）
- 特殊グループの自動表示: 現場未定・休み・空車（運輸のみ）・整備/車検/故障/使用停止（運輸のみ）
- 出退勤状態の表示（白札=出勤中、赤札=退勤済み。「休み」グループへの振り分け）
  - `attendance_events`の**読み取りのみ**。タップして記録する打刻操作は対象外（次issue）
- 縦書き表示（数字連続部分の縦中横処理を含む、長い名称の自動複数列折り返し）
- 見出しタップによる行の開閉（初期状態は全展開、部門ごとに「すべて開く/すべて閉じる」）
- Supabase Realtimeによる複数端末間の自動同期

### スコープ外（次issue以降）

- 配車登録ウィザード・個別配車変更・現場グループ編集
- 出退勤の打刻操作（記録・日次/月次集計・CSV出力）
- 車両状態変更UI（車検・整備・故障・使用停止の変更操作）
- 音声配車入力
- 認証・RLS本締め（issue #3で対応）
- マスタデータ投入（別セッションで対応中）

## スキーマ変更

### 発見した既存スキーマのギャップ

`placement_slots`（`id, site_id, opened_at, ended_at`）には部門（土木/運輸）の情報が
無い。前回のspec（2026-08-25-supabase-db-setup-design.md）は「当日の配置枠の部門は
`placement_slots.site_id -> sites.category`経由で分かる」という前提だったが、
`sites.category`には「共通」があり、CLAUDE.mdの不変条件（部門横断: 土木の作業員が
運輸のダンプに乗る日がある）およびlegacyの実装（`dispatchGroups`は`site_id + department`
の組で別グループになる。共通区分の現場は土木配置枠と運輸配置枠が同時に別々に存在しうる）
と付き合わせると、`site.category`だけでは配置枠の表示先部門を一意に決定できない。

### 対応: マイグレーション追加

`supabase/migrations/0004_placement_department.sql`

```sql
alter table placement_slots
  add column department text not null check (department in ('土木', '運輸'));

create index placement_slots_department_idx on placement_slots (department);
```

既存の`placement_slots`テーブルへの追加のみ。DROPは行わない（他マイグレーションの
慣習に合わせる）。

### 丸数字（フェアロード①②③）の扱い

専用カラムは持たない。`site_id + department`の組ごとに`opened_at`昇順で採番した連番を、
クエリ側で`row_number() over (partition by site_id, department order by opened_at)`と
して都度算出する。過去の配置枠を削除しない不変条件と整合し、終了済みの枠があっても
番号がずれない（legacyの`nextGroupSequence`が「これまでに作られた最大値+1」を使い、
終了済みグループを含めて数えているのと同じ挙動になる）。

### 削除する分岐: 車両状態「不明」警告

legacyの`computeVehicleSummary`は`status`が既知の5値以外だった場合に警告を出す
（`unknown`カウント）。新スキーマでは`vehicles.status`にCHECK制約があり、既知の5値
以外の値は挿入時点でDBが拒否するため、この分岐はそもそも到達不能になる。実装しない。

## コンポーネント/データ取得アーキテクチャ

CLAUDE.mdの「DBフェッチ1単位=1コンポーネント=1 Suspense境界」「`Promise.all`を使わない」
を厳密に適用する。

```
app/page.tsx
├─ <ClockHeader />                    … フェッチ無し(client, setIntervalで時刻更新)
├─ <RealtimeBoardWatcher />           … フェッチ無し(client, Realtime購読のみ、画面には何も描画しない)
├─ <DepartmentBoard dept="土木">
│    Suspense: <SiteGroupList dept="土木" />
│      → 該当部門のplacement_slots一覧(id・site名・department・作成順連番)だけを取得
│      → 各要素を <Suspense><SiteGroupCard slotId=".." /></Suspense> として描画
│      → 加えて <Suspense><UnassignedStaffGroup dept="土木" /></Suspense>
│              <Suspense><RestingStaffGroup dept="土木" /></Suspense>
└─ <DepartmentBoard dept="運輸">
     Suspense: <VehicleSummaryBar />   … 車両20台の集計(使用中/空車/整備/車検/故障/使用停止/合計)
     Suspense: <SiteGroupList dept="運輸" />（同上）
     Suspense: <IdleVehicleGroup />    … 空車(運輸のみ)
     Suspense: <VehicleStatusGroup status="整備|車検|故障|使用停止" />（状態ごとに1つずつ）
```

- `SiteGroupList`は「どの配置枠が存在するか」という軽量な一覧（id・現場名・部門・連番）
  だけを取得する。実際の人員・車両データは各`SiteGroupCard`が`slotId`を受け取って
  自分でフェッチする。IDを子に渡すのは「フェッチ結果のバケツリレー」ではなく参照渡し
  なので、CLAUDE.mdの規約に反しない。
- 各グループコンポーネントは独立してストリーミングされるため、配置枠数が多くても
  表示の速いところから順にレンダリングされる。
- 出退勤状態（白/赤）は`SiteGroupCard`・`UnassignedStaffGroup`等が対象staffの
  `attendance_events`から最新イベントを取得して判定する。

### 特殊グループの判定ロジック（純粋関数として切り出しVitestで単体テスト）

**重要な不変条件（CLAUDE.md）**: 配置枠(`staff_placements.slot_id`)に入っている人は、
退勤しても配置枠のレーンに残ったまま名前札の色が白→赤に変わるだけで、「休み」には
絶対に移動しない。「休み」「現場未定」は、そもそもどの配置枠にも入っていない人
（`slot_id is null`）だけを対象とする。これはlegacyの`buildDepartmentLanes`のコメント
（「出退勤タップは配置(todayGroupId)を一切変えない」）で明文化されている確定仕様であり、
本実装でも変更しない。

- **配置枠あり**（`slot_id is not null`）: 出退勤状態に関わらずその配置枠の
  `SiteGroupCard`に表示する。名前札の色だけが最新イベントに応じて白/赤に変わる
- **現場未定**: `slot_id is null`かつ出勤中（最新イベントが`clockIn`）の人
- **休み**: `slot_id is null`かつ退勤中（最新イベントが`clockOut`、または
  `attendance_events`に記録が一件も無い）の人
- **現在の出退勤状態の判定**: 対象staffの`attendance_events`のうち最新1件
  （`occurred_at`降順、同時刻ならID等でタイブレーク）の`action`を採用する。
  新実装のスキーマには「現在の状態」を保持する専用カラムが無く常にイベントログから
  導出するため、日付をまたいでも自動リセットはされない（legacyの「日付が変わった際の
  自動リセットはしない」仕様と結果的に一致する）。記録が一件も無い人は`clockOut`
  相当（退勤中）として扱う
- **空車（運輸のみ）**: `vehicles.status = '使用可能'`かつ、当日その車両に乗っている
  人がいない（`staff_placements.assigned_vehicle_id`に一致する行が無い）かつ
  `vehicle_placements.slot_id is null`（現場に無人駐車もされていない）
- **整備/車検/故障/使用停止（運輸のみ）**: `vehicles.status`が該当区分の車両
- 部門をまたぐダンプ乗車（土木作業員が運輸のダンプに乗る）でも、空車判定・使用中判定は
  「今日その車両に実際に乗っている人がいるか」で一元的に計算するため、部門を問わず
  正しく反映される（CLAUDE.mdの不変条件どおり）。

## Realtime同期

`RealtimeBoardWatcher`（クライアントコンポーネント、`app/page.tsx`に1つだけ配置）が
`staff` / `vehicles` / `sites` / `placement_slots` / `staff_placements` /
`vehicle_placements` / `attendance_events`のpostgres_changesを購読し、変更を検知する
たびに`next/navigation`の`router.refresh()`を呼ぶ。これによりサーバー側のSuspense
境界が再フェッチ・再ストリーミングされ、複雑なクライアント側状態管理を持ち込まずに
複数端末間の自動同期を実現する。

トレードオフ: `router.refresh()`は現在のルートの全Server Componentを再実行するため、
単一のテーブル変更でも盤面全体のクエリが再実行される。ただし各Suspense境界は独立して
ストリーミングされ、現状の規模（ダンプ20台・運輸現場15箇所程度）ではクエリコスト自体が
小さいため許容する。将来的に負荷が問題になれば、変更されたテーブルに応じて特定の
Suspense境界だけを再検証する方式へ改善する（今回は行わない）。

## 折りたたみ

`SiteGroupList`が配置枠ID一覧（IDのみ、実データは持たない）を取得したあと、部門ごとの
`CollapsibleBoard`（クライアントコンポーネント）にID一覧を渡す。`CollapsibleBoard`は
「閉じている行IDのSet」をローカルstateで管理し、各行見出しタップでトグル、
「すべて開く/すべて閉じる」ボタンでSetを一括操作する。各`SiteGroupCard`等は
Server Componentのまま、`CollapsibleBoard`配下の`CollapsibleSection`に`children`として
描画結果を渡す（Server ComponentをClient Componentの`children`として渡す、Next.jsの
標準パターン）。開閉状態はページ遷移・リロードで初期化する（保存しない。legacyと同じ
挙動）。

## 縦書き表示

`components/ui/`に取り込む共通の`<VerticalText>`ラッパーで実装する。

- `writing-mode: vertical-rl`を基本とする
- 数字が連続する部分だけ`text-combine-upright: digits 2`（縦中横）を適用
- 長い名称は`writing-mode`の列挙動（複数列に自動で折り返す）で対応する
- Chrome（キオスク運用の前提ブラウザ）でのネイティブCSSサポートのみで完結させ、
  JS側での文字組みライブラリは導入しない

## テスト方針

- **Vitest（単体）**: 特殊グループ振り分けロジック、丸数字連番の算出、出退勤最新
  イベントからの白/赤判定を、DBに依存しない純粋関数として切り出してテストする。
  DBを介するクエリ部分は既存パターン（`tests/db/*.test.ts`）に倣い、実DBに`TEST_`
  接頭辞のデータを作成・削除して検証する。
- **Playwright（E2E）**: 配置枠・特殊グループが正しく表示されること、折りたたみの
  開閉、Realtimeでの自動更新（別クライアントでの変更が反映されるか）を確認する。
- **ブラウザ確認**: 実装後に実際にChromeで盤面を開き、縦書き表示・折りたたみ・
  Realtime反映を目視確認してから完了とする（UI変更は目視確認が必須というCLAUDE.mdの
  運用方針に従う）。

## 動作確認方法

1. `supabase db push`で`0004_placement_department.sql`を適用
2. `pnpm dev`でローカル起動し、Chromeで盤面を開く
3. 別セッションで進行中のマスタデータ投入が完了次第、実データで表示を確認
4. 開発用に`TEST_`接頭辞のダミーデータ（配置枠複数・特殊グループ該当データ含む）を
   一時的に投入し、3カラム表示・特殊グループ・折りたたみ・縦書きを確認後、削除する
5. 2つのブラウザタブを開き、片方でSupabaseダッシュボードまたはSQLからデータを変更し、
   もう片方が自動更新されることを確認する

## 未決定のまま残る事項（このissueでは扱わない）

- Realtime再検証の粒度最適化（テーブル単位での部分再フェッチ）
- 認証・RLS本締め（issue #3）
- 配車登録・変更・出退勤打刻・車両状態変更UI（後続issue）
