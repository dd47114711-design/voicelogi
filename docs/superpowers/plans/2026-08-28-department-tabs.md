# 盤面の部門タブ化と事務部門・全体確認の移植 実装計画

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 盤面を土木・運輸・事務・全体確認の4タブ構成にし、legacy にあって新実装から欠けていた事務部門と全体確認を移植する。

**Architecture:** タブの選択状態は `?dept=` として URL に持たせ、`app/page.tsx`（Server Component）が `searchParams` から読んで対象タブの盤面だけをレンダリングする。タブバーはクライアント状態を持たない `<Link>` の羅列。事務部門は `staff.department` の CHECK に `'事務'` を足すだけで、`placement_slots` には追加しない（事務員は配置枠を持たない）。この不変条件は `BoardDepartment` / `StaffDepartment` の2つの型で分けてコンパイル時にも守る。

**Tech Stack:** Next.js 16 (App Router / Server Components), React 19, TypeScript (strict), Tailwind CSS 4, Supabase (supabase-js, 手書きSQLマイグレーション), Vitest, Playwright, pnpm

**Spec:** `docs/superpowers/specs/2026-08-28-department-tabs-design.md`

## Global Constraints

- 応答・コミットメッセージ・コード内コメント・UI文言は**すべて日本語**で書く。
- `any` を使わない。`tsconfig.json` は `strict: true`。
- **ORM を使わない。** `supabase-js` をサーバ側モジュールから直接呼ぶ。
- **`Promise.all` を使わない。** 並列化は React のコンポーネント境界（独立した Suspense 境界）に任せる。
- **DBフェッチ1単位 = 1コンポーネント = 1 Suspense 境界。** 取得結果を親から props でバケツリレーしない。
- 既定は Server Component。`"use client"` は実際にイベントハンドラ・状態・ブラウザAPIが要る葉にだけ付ける。
- Next.js 16 では `params` / `searchParams` が **Promise**。`await` して読む。
- スキーマ変更は `supabase/migrations/` の手書きSQLのみ。Supabase ダッシュボードで手編集しない。
- 実装より先にテストを書き、**失敗することを確認してから**実装する。
- Supabase のエラーは日本語メッセージを付けて `throw` する。握り潰してゼロを返さない。
- 札の色は 出勤=白 / 退勤=赤（確定仕様）。文字は縦書き。
- 作業ブランチ `feature/13-department-tabs`、worktree `D:\dev\voicelogi\.claude\worktrees\issue-13-department-tabs`。

## ファイル構成

| ファイル | 責務 | 種別 |
| --- | --- | --- |
| `supabase/migrations/0007_office_department.sql` | `staff.department` に `'事務'` を許可 | 新規 |
| `lib/board/department.ts` | `BoardDepartment` / `StaffDepartment` 型と、タブキーの相互変換 | 新規 |
| `lib/queries/office-staff.ts` | 事務員の一覧と出退勤状態を取る | 新規 |
| `lib/queries/department-attendance.ts` | 部門ごとの出勤/退勤人数を数える | 新規 |
| `lib/queries/active-slot-count.ts` | 部門ごとの稼働配置枠数を数える | 新規 |
| `components/board/department-tab-bar.tsx` | 4つのタブリンク（カウントなしの外枠） | 新規 |
| `components/board/department-tab-counts.tsx` | タブ見出しのカウント（独立Suspense） | 新規 |
| `components/board/office-board.tsx` | 事務盤面 | 新規 |
| `components/board/summary-board.tsx` | 全体確認のカード並べ | 新規 |
| `components/board/summary-card.tsx` | 全体確認のカード1枚の見た目 | 新規 |
| `components/board/summary-doboku-card.tsx` | 土木カード（自分でフェッチ） | 新規 |
| `components/board/summary-unyu-card.tsx` | 運輸カード（自分でフェッチ） | 新規 |
| `components/board/summary-office-card.tsx` | 事務カード（自分でフェッチ） | 新規 |
| `app/page.tsx` | `?dept=` を読んでタブバー＋対象盤面を出す | 変更 |
| `lib/board/group-labels.ts` | 型を `BoardDepartment` に差し替え | 変更 |
| `lib/queries/site-groups.ts` | 同上 | 変更 |
| `lib/queries/unassigned-staff.ts` | 同上 | 変更 |
| `components/board/department-board.tsx` | 同上 | 変更 |
| `components/board/site-group-card.tsx` | 同上 | 変更 |
| `components/board/site-group-list.tsx` | 同上 | 変更 |
| `components/board/unassigned-staff-group.tsx` | 同上 | 変更 |
| `components/board/resting-staff-group.tsx` | 同上 | 変更 |
| `scripts/seed-master-data.mjs` | 事務4名を追加し、冪等性を行単位に変更 | 変更 |

---

### Task 1: 部門の型とタブキーの変換

`'土木' | '運輸'` がコードベースの10箇所にインラインで散らばっている。これを1箇所にまとめ、
さらに「配置枠を持てる部門」と「従業員の所属部門」を型として分離する。URL の `?dept=` は
ASCII のキー（`doboku` / `unyu` / `office` / `summary`）を使うので、その相互変換もここに置く。

**Files:**
- Create: `lib/board/department.ts`
- Test: `tests/lib/board/department.test.ts`

**Interfaces:**
- Consumes: なし（最初のタスク）
- Produces:
  - `type BoardDepartment = '土木' | '運輸'`
  - `type StaffDepartment = BoardDepartment | '事務'`
  - `type TabKey = 'doboku' | 'unyu' | 'office' | 'summary'`
  - `const TAB_KEYS: readonly TabKey[]`
  - `function resolveTabKey(raw: string | string[] | undefined): TabKey` — 未知の値・未指定は `'doboku'`
  - `function departmentOfTab(tab: TabKey): StaffDepartment | null` — `'summary'` のときだけ `null`
  - `function tabLabel(tab: TabKey): string` — `'土木' | '運輸' | '事務' | '全体確認'`

- [ ] **Step 1: 失敗するテストを書く**

`tests/lib/board/department.test.ts`:

```typescript
import { describe, it, expect } from 'vitest'
import {
  resolveTabKey,
  departmentOfTab,
  tabLabel,
  TAB_KEYS,
} from '@/lib/board/department'

describe('resolveTabKey', () => {
  it('未指定のときは土木タブになる', () => {
    expect(resolveTabKey(undefined)).toBe('doboku')
  })

  it('既知のキーはそのまま通す', () => {
    expect(resolveTabKey('unyu')).toBe('unyu')
    expect(resolveTabKey('office')).toBe('office')
    expect(resolveTabKey('summary')).toBe('summary')
  })

  it('未知の値は土木タブに落とす', () => {
    expect(resolveTabKey('存在しない部門')).toBe('doboku')
  })

  it('同じキーが複数回指定された場合は最初の値を見る', () => {
    // ?dept=unyu&dept=office のように来ると searchParams は配列になる
    expect(resolveTabKey(['unyu', 'office'])).toBe('unyu')
  })

  it('空配列は土木タブに落とす', () => {
    expect(resolveTabKey([])).toBe('doboku')
  })
})

describe('departmentOfTab', () => {
  it('部門タブは対応する所属を返す', () => {
    expect(departmentOfTab('doboku')).toBe('土木')
    expect(departmentOfTab('unyu')).toBe('運輸')
    expect(departmentOfTab('office')).toBe('事務')
  })

  it('全体確認は特定の部門を持たない', () => {
    expect(departmentOfTab('summary')).toBeNull()
  })
})

describe('tabLabel', () => {
  it('画面に出す日本語のラベルを返す', () => {
    expect(TAB_KEYS.map(tabLabel)).toEqual(['土木', '運輸', '事務', '全体確認'])
  })
})
```

- [ ] **Step 2: テストを実行し、失敗することを確認する**

Run: `pnpm exec vitest run tests/lib/board/department.test.ts`
Expected: FAIL — `Failed to resolve import "@/lib/board/department"`

- [ ] **Step 3: 実装を書く**

`lib/board/department.ts`:

```typescript
/**
 * 現場・配置枠を持つ部門。placement_slots.department に入りうるのはこの2つだけ。
 * 事務員は現場にもダンプにも紐づかないため、ここには含めない。
 */
export type BoardDepartment = '土木' | '運輸'

/** 従業員の所属部門。staff.department に入る値。 */
export type StaffDepartment = BoardDepartment | '事務'

/** URLの ?dept= に載せるキー。日本語をクエリに入れずに済ませるためのASCII表現。 */
export type TabKey = 'doboku' | 'unyu' | 'office' | 'summary'

export const TAB_KEYS = ['doboku', 'unyu', 'office', 'summary'] as const satisfies readonly TabKey[]

const DEPARTMENT_BY_TAB: Record<TabKey, StaffDepartment | null> = {
  doboku: '土木',
  unyu: '運輸',
  office: '事務',
  summary: null,
}

const LABEL_BY_TAB: Record<TabKey, string> = {
  doboku: '土木',
  unyu: '運輸',
  office: '事務',
  summary: '全体確認',
}

function isTabKey(value: string): value is TabKey {
  return (TAB_KEYS as readonly string[]).includes(value)
}

/**
 * searchParams から来た生の値をタブキーに正規化する。
 * 未指定・未知の値は土木にフォールバックし、404にはしない。
 * 現場のタッチモニターでURLが壊れても盤面が出なくならないようにするため。
 */
export function resolveTabKey(raw: string | string[] | undefined): TabKey {
  const value = Array.isArray(raw) ? raw[0] : raw
  if (value !== undefined && isTabKey(value)) {
    return value
  }
  return 'doboku'
}

/** タブに対応する所属部門。全体確認は特定の部門を持たないので null。 */
export function departmentOfTab(tab: TabKey): StaffDepartment | null {
  return DEPARTMENT_BY_TAB[tab]
}

export function tabLabel(tab: TabKey): string {
  return LABEL_BY_TAB[tab]
}
```

- [ ] **Step 4: テストを実行し、通ることを確認する**

Run: `pnpm exec vitest run tests/lib/board/department.test.ts`
Expected: PASS（8 tests）

- [ ] **Step 5: コミット**

```bash
git add lib/board/department.ts tests/lib/board/department.test.ts
git commit -m "feat: 部門の型とタブキーの変換を追加する

'土木' | '運輸' がコードベースに散らばっているのを1箇所にまとめる。
あわせて配置枠を持てる部門(BoardDepartment)と従業員の所属(StaffDepartment)を
型として分け、事務が配置枠に入らないことをコンパイル時にも守れるようにする。

Refs #13"
```

---

### Task 2: 既存コードを新しい型に載せ替える

Task 1 で作った型を、既存の10箇所のインライン型リテラルに適用する。振る舞いは一切変えない
純粋な差し替えなので、既存テストが全部通ることが検証になる。

**Files:**
- Modify: `lib/board/group-labels.ts:7`
- Modify: `lib/queries/site-groups.ts:7,10,27`
- Modify: `lib/queries/unassigned-staff.ts:22`
- Modify: `components/board/department-board.tsx:12`
- Modify: `components/board/site-group-card.tsx:14`
- Modify: `components/board/site-group-list.tsx:5`
- Modify: `components/board/unassigned-staff-group.tsx:6`
- Modify: `components/board/resting-staff-group.tsx:6`

**Interfaces:**
- Consumes: `BoardDepartment`（Task 1）
- Produces: 上記ファイルの公開シグネチャが `'土木' | '運輸'` から `BoardDepartment` に変わる（実体は同じ型）

- [ ] **Step 1: 変更前に既存テストが通ることを確認する**

Run: `pnpm test`
Expected: PASS（45 tests。既存37件 + Task 1 の8件）

これは「差し替え後も同じ結果になる」ことを言うための基準点。数を控えておく。

- [ ] **Step 2: 8ファイルの型リテラルを差し替える**

各ファイルの先頭に import を足し、`'土木' | '運輸'` を `BoardDepartment` に置き換える。

`lib/board/group-labels.ts` — 7行目:

```typescript
import type { BoardDepartment } from './department'
```

を先頭に足し、`department: '土木' | '運輸'` を `department: BoardDepartment` にする。

`lib/queries/site-groups.ts` — 先頭に:

```typescript
import type { BoardDepartment } from '@/lib/board/department'
```

を足し、3箇所（7行目の `department:`、10行目の引数、27行目の `as`）を `BoardDepartment` にする。

`lib/queries/unassigned-staff.ts` — 先頭に同じ import を足し、22行目の引数を `BoardDepartment` にする。

`components/board/department-board.tsx` / `site-group-card.tsx` / `site-group-list.tsx` /
`unassigned-staff-group.tsx` / `resting-staff-group.tsx` — それぞれ先頭に:

```typescript
import type { BoardDepartment } from '@/lib/board/department'
```

を足し、`department: '土木' | '運輸'` を `department: BoardDepartment` にする。

- [ ] **Step 3: 型リテラルが残っていないことを確認する**

Run: `git grep -n "'土木' | '運輸'" -- '*.ts' '*.tsx'`
Expected: `lib/board/department.ts` の `BoardDepartment` 定義の1行だけがヒットする。他は0件。

- [ ] **Step 4: 型チェックと既存テストを通す**

Run: `pnpm exec tsc --noEmit`
Expected: 出力なし（エラーなし）

Run: `pnpm test`
Expected: PASS（45 tests。Step 1 とまったく同じ数。型の差し替えだけなので増減してはいけない）

- [ ] **Step 5: コミット**

```bash
git add lib components
git commit -m "refactor: 部門のインライン型リテラルをBoardDepartmentに置き換える

振る舞いは変えていない。型の定義を1箇所に寄せるだけの差し替え。

Refs #13"
```

---

### Task 3: 事務部門をスキーマに追加する

`staff.department` の CHECK 制約に `'事務'` を足す。`placement_slots.department` は**変更しない**。

**Files:**
- Create: `supabase/migrations/0007_office_department.sql`

**Interfaces:**
- Consumes: なし
- Produces: `staff.department` に `'事務'` を保存できるようになる

- [ ] **Step 1: マイグレーションを書く**

`supabase/migrations/0007_office_department.sql`:

```sql
-- 事務部門を staff に追加する。
--
-- legacy(webapp/app.js:1176)の事務部門は「現場・ダンプを持たない、氏名+出退勤のみ」で、
-- 配置枠にも現場にも入らない。そのため placement_slots.department は意図的に
-- ('土木', '運輸') のまま据え置く。ここを開けると「事務部門の現場」という
-- 存在しない概念が作れてしまうため、DB側で塞いだままにする。

alter table staff
  drop constraint staff_department_check;

alter table staff
  add constraint staff_department_check
  check (department in ('土木', '運輸', '事務'));
```

- [ ] **Step 2: 制約名が実際に `staff_department_check` であることを確認する**

`0001_init_schema.sql:6` はインラインの `check (...)` なので、Postgres が自動命名している。
「テーブル名_カラム名_check」が既定の命名規則だが、思い込みで流さず実物を確認する。

Run:

```bash
pnpm exec supabase db push --dry-run
```

これで流れる SQL が表示される。制約名の確認がこれで取れない場合は、
Supabase ダッシュボードの SQL Editor（**閲覧のみ。ここでスキーマを変更しない**）で次を実行する:

```sql
select conname from pg_constraint
where conrelid = 'staff'::regclass and contype = 'c';
```

Expected: `staff_department_check` が返る。違う名前だった場合は、その名前に
`drop constraint` の行を書き換えてから次へ進む。

- [ ] **Step 3: マイグレーションを適用する**

Run: `pnpm exec supabase db push`
Expected: `0007_office_department.sql` が適用され、エラーなく終了する

失敗した場合（制約名が違う）: エラーメッセージの制約名で `drop constraint` の行を直し、再実行する。

- [ ] **Step 4: 事務が保存できるようになったことを確認する**

Run:

```bash
node --input-type=module -e "
import { config } from 'dotenv'
import { createClient } from '@supabase/supabase-js'
config({ path: '.env.local' })
const db = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY)
const { data, error } = await db.from('staff').insert({ name: 'TEST_事務制約確認', department: '事務' }).select('id').single()
if (error) { console.error('NG:', error.message); process.exit(1) }
console.log('OK: 事務で挿入できた')
await db.from('staff').delete().eq('id', data.id)
console.log('後片付け完了')
"
```

Expected: `OK: 事務で挿入できた` と `後片付け完了` が出る

- [ ] **Step 5: コミット**

```bash
git add supabase/migrations/0007_office_department.sql
git commit -m "feat: staff.departmentに事務を追加する

placement_slots.department は意図的に据え置く。事務員は現場にも配置枠にも
入らないため、DB側で塞いだままにする。

Refs #13"
```

---

### Task 4: 事務員4名を投入できるようにする

`scripts/seed-master-data.mjs` に事務4名を足す。ただし現在の冪等性は「staff に1件でもあれば
何もしない」なので、既に31人いる本番DBには入らない。**「未登録の従業員だけ挿入する」方式**に
変える。既存判定のキーは `(name, department)` の組。

**Files:**
- Modify: `scripts/seed-master-data.mjs:1-10`（先頭コメント）, `:31-62`（staffSeed）, `:177`（departmentMap）, `:180-238`（main）

**Interfaces:**
- Consumes: Task 3 のマイグレーション（`'事務'` が保存できること）
- Produces: DB の `staff` に事務4名が入る

- [ ] **Step 1: 先頭コメントを実態に合わせる**

`scripts/seed-master-data.mjs` の1〜10行目を差し替える。旧コメントの
「事務部門(office)の4名は配車盤の対象外のため除外している」は事実でなくなる。

```javascript
// legacy/webapp/seed.js の実データ(社員・車両・取引先)を、新スキーマに変換して
// Supabaseへ投入するスクリプト。
//
// 実行方法: node scripts/seed-master-data.mjs
//
// 冪等性: 行単位で判定する。sites/vehicles は名前・車番が既に登録済みならスキップし、
// staff は (氏名, 部門) の組が既に登録済みならスキップする。何度実行しても
// 未登録のものだけが追加される。
// 当日の配置状態(placement_slots/staff_placements/vehicle_placements/
// attendance_events)は投入しない。マスタデータのみ。
```

- [ ] **Step 2: 事務4名を staffSeed に足す**

`scripts/seed-master-data.mjs` の `staffSeed` 配列の末尾（`{ name: '栢原勲', ... }` の直後、
`]` の直前）に4行足す。legacy `webapp/app.js:264-269` の4名。

```javascript
  { name: '黒瀬とも美', department: 'office', normalVehicleId: null, order: 1 },
  { name: '山内舞', department: 'office', normalVehicleId: null, order: 2 },
  { name: '江川愛梨', department: 'office', normalVehicleId: null, order: 3 },
  { name: '谷口扶美代', department: 'office', normalVehicleId: null, order: 4 },
```

- [ ] **Step 3: departmentMap に事務を足す**

`scripts/seed-master-data.mjs:177` を差し替える。

```javascript
const departmentMap = { doboku: '土木', unyu: '運輸', office: '事務' }
```

- [ ] **Step 4: main() を行単位の冪等性に書き換える**

`scripts/seed-master-data.mjs:180-238` の `main()` を丸ごと差し替える。
`--force` フラグと 26行目の `const force = ...` は不要になるので、26行目も削除する。

```javascript
async function main() {
  // --- sites: 名前が未登録のものだけ入れる ---
  const { data: existingSites, error: sitesFetchError } = await supabase.from('sites').select('name')
  if (sitesFetchError) throw new Error(`sites取得に失敗: ${sitesFetchError.message}`)
  const knownSiteNames = new Set((existingSites ?? []).map((s) => s.name))
  const newSites = sitesSeed.filter((s) => !knownSiteNames.has(s.name))

  if (newSites.length > 0) {
    console.log(`sitesを${newSites.length}件投入中...`)
    const { error } = await supabase.from('sites').insert(
      newSites.map((s) => ({
        name: s.name,
        furigana: s.furigana,
        category: categoryMap[s.category],
        display_order: s.order,
      })),
    )
    if (error) throw new Error(`sites投入に失敗: ${error.message}`)
  }

  // --- vehicles: 車番が未登録のものだけ入れる ---
  const { data: existingVehicles, error: vehiclesFetchError } = await supabase
    .from('vehicles')
    .select('vehicle_number')
  if (vehiclesFetchError) throw new Error(`vehicles取得に失敗: ${vehiclesFetchError.message}`)
  const knownVehicleNumbers = new Set((existingVehicles ?? []).map((v) => v.vehicle_number))
  const newVehicles = vehiclesSeed.filter((v) => !knownVehicleNumbers.has(v.vehicleNumber))

  if (newVehicles.length > 0) {
    console.log(`vehiclesを${newVehicles.length}件投入中...`)
    const { error } = await supabase.from('vehicles').insert(
      newVehicles.map((v) => ({
        display_name: v.displayName,
        vehicle_number: v.vehicleNumber,
        vehicle_type: v.vehicleType,
        display_order: v.order,
      })),
    )
    if (error) throw new Error(`vehicles投入に失敗: ${error.message}`)
  }

  // --- staff: (氏名, 部門) が未登録のものだけ入れる ---
  // 通常ダンプの紐付けに車両IDが要るため、車両を入れ終わってから引き直す。
  const { data: allVehicles, error: refetchVehiclesError } = await supabase
    .from('vehicles')
    .select('id, vehicle_number')
  if (refetchVehiclesError) throw new Error(`vehicles再取得に失敗: ${refetchVehiclesError.message}`)

  const vehicleIdByNumber = new Map(allVehicles.map((v) => [v.vehicle_number, v.id]))
  const vehicleNumberByLegacyId = new Map(vehiclesSeed.map((v) => [v.legacyId, v.vehicleNumber]))

  const { data: existingStaff, error: staffFetchError } = await supabase
    .from('staff')
    .select('name, department')
  if (staffFetchError) throw new Error(`staff取得に失敗: ${staffFetchError.message}`)
  const knownStaff = new Set((existingStaff ?? []).map((s) => `${s.name}\u0000${s.department}`))
  const newStaff = staffSeed.filter(
    (s) => !knownStaff.has(`${s.name}\u0000${departmentMap[s.department]}`),
  )

  if (newStaff.length > 0) {
    console.log(`staffを${newStaff.length}件投入中...`)
    const { error } = await supabase.from('staff').insert(
      newStaff.map((s) => {
        const vehicleNumber = s.normalVehicleId
          ? vehicleNumberByLegacyId.get(s.normalVehicleId)
          : null
        const normalVehicleId = vehicleNumber ? vehicleIdByNumber.get(vehicleNumber) : null
        return {
          name: s.name,
          department: departmentMap[s.department],
          normal_vehicle_id: normalVehicleId ?? null,
          display_order: s.order,
        }
      }),
    )
    if (error) throw new Error(`staff投入に失敗: ${error.message}`)
  }

  console.log(
    `完了: 新規投入 staff ${newStaff.length}件 / vehicles ${newVehicles.length}件 / sites ${newSites.length}件`,
  )
}
```

- [ ] **Step 5: 実行して事務4名が入ることを確認する**

Run: `node scripts/seed-master-data.mjs`
Expected: `完了: 新規投入 staff 4件 / vehicles 0件 / sites 0件`

- [ ] **Step 6: もう一度実行して、二重投入されないことを確認する**

Run: `node scripts/seed-master-data.mjs`
Expected: `完了: 新規投入 staff 0件 / vehicles 0件 / sites 0件`

これが行単位の冪等性の検証。

- [ ] **Step 7: DBの分布を確認する**

Run:

```bash
node --input-type=module -e "
import { config } from 'dotenv'
import { createClient } from '@supabase/supabase-js'
config({ path: '.env.local' })
const db = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY)
const { data } = await db.from('staff').select('department')
const c = {}
for (const s of data) c[s.department] = (c[s.department] ?? 0) + 1
console.log(c)
"
```

Expected: `{ '土木': 11, '運輸': 20, '事務': 4 }`

- [ ] **Step 8: コミット**

```bash
git add scripts/seed-master-data.mjs
git commit -m "feat: 事務員4名をseedに追加し、冪等性を行単位にする

既存の冪等性は「staffに1件でもあれば何もしない」という全体単位の判定で、
既に31人が入っている本番DBには事務4名が永久に入らなかった。
未登録の行だけを入れる方式に変え、新規環境と既存環境を同じ経路で扱う。

Refs #13"
```

---

### Task 5: 事務員を取得するクエリ

事務盤面が使う。事務員の一覧と、それぞれの出退勤状態を返す。

**Files:**
- Create: `lib/queries/office-staff.ts`
- Test: `tests/lib/queries/office-staff.test.ts`

**Interfaces:**
- Consumes: `attendanceLookbackCutoff` / `attendanceStatusByStaff` / `AttendanceStatus`（`lib/board/attendance-status.ts`、既存）
- Produces:
  - `interface OfficeStaffMember { staffId: string; name: string; status: AttendanceStatus }`
  - `function getOfficeStaff(): Promise<OfficeStaffMember[]>` — `display_order` 昇順

- [ ] **Step 1: 失敗するテストを書く**

既存の `tests/lib/queries/unassigned-staff.test.ts` と同じモック方式に合わせる。
まず既存テストを読んでモックの張り方を確認すること。

Run: `cat tests/lib/queries/unassigned-staff.test.ts`

`tests/lib/queries/office-staff.test.ts`:

```typescript
import { describe, it, expect, vi, beforeEach } from 'vitest'

const mockFrom = vi.fn()

vi.mock('@/lib/supabase/server', () => ({
  createServerSupabaseClient: () => ({ from: mockFrom }),
}))

import { getOfficeStaff } from '@/lib/queries/office-staff'

/** staff テーブル用のクエリビルダのモック。 */
function staffQuery(rows: { id: string; name: string }[]) {
  const builder = {
    select: () => builder,
    eq: () => builder,
    order: () => Promise.resolve({ data: rows, error: null }),
  }
  return builder
}

/** attendance_events テーブル用のクエリビルダのモック。 */
function eventQuery(rows: { staff_id: string; action: string; occurred_at: string }[]) {
  const builder = {
    select: () => builder,
    in: () => builder,
    gte: () => Promise.resolve({ data: rows, error: null }),
  }
  return builder
}

beforeEach(() => {
  mockFrom.mockReset()
})

describe('getOfficeStaff', () => {
  it('事務員を出退勤状態つきで返す', async () => {
    mockFrom.mockImplementation((table: string) => {
      if (table === 'staff') {
        return staffQuery([
          { id: 's1', name: '黒瀬とも美' },
          { id: 's2', name: '山内舞' },
        ])
      }
      return eventQuery([
        { staff_id: 's1', action: 'clockIn', occurred_at: '2026-08-28T00:00:00.000Z' },
      ])
    })

    const result = await getOfficeStaff()

    expect(result).toEqual([
      { staffId: 's1', name: '黒瀬とも美', status: 'present' },
      { staffId: 's2', name: '山内舞', status: 'absent' },
    ])
  })

  it('事務員が0人なら空配列を返す', async () => {
    mockFrom.mockImplementation((table: string) =>
      table === 'staff' ? staffQuery([]) : eventQuery([]),
    )

    expect(await getOfficeStaff()).toEqual([])
  })

  it('打刻が無い人は退勤扱いになる', async () => {
    mockFrom.mockImplementation((table: string) =>
      table === 'staff' ? staffQuery([{ id: 's1', name: '江川愛梨' }]) : eventQuery([]),
    )

    const result = await getOfficeStaff()
    expect(result[0].status).toBe('absent')
  })

  it('staffの取得に失敗したら日本語のエラーで落ちる', async () => {
    mockFrom.mockImplementation(() => ({
      select: function () { return this },
      eq: function () { return this },
      order: () => Promise.resolve({ data: null, error: { message: 'boom' } }),
    }))

    await expect(getOfficeStaff()).rejects.toThrow('事務員一覧の取得に失敗しました: boom')
  })
})
```

- [ ] **Step 2: テストを実行し、失敗することを確認する**

Run: `pnpm exec vitest run tests/lib/queries/office-staff.test.ts`
Expected: FAIL — `Failed to resolve import "@/lib/queries/office-staff"`

- [ ] **Step 3: 実装を書く**

`lib/queries/office-staff.ts`:

```typescript
import { createServerSupabaseClient } from '@/lib/supabase/server'
import {
  attendanceLookbackCutoff,
  attendanceStatusByStaff,
  type AttendanceStatus,
} from '@/lib/board/attendance-status'

const NIL_UUID = '00000000-0000-0000-0000-000000000000'

export interface OfficeStaffMember {
  staffId: string
  name: string
  status: AttendanceStatus
}

/**
 * 事務部門の在籍者を、出退勤状態つきで表示順に返す。
 * 事務員は配置枠を持たないため、土木・運輸のように「現場未定」「休み」で
 * 分けず、全員を1つの一覧として返す。
 */
export async function getOfficeStaff(): Promise<OfficeStaffMember[]> {
  const supabase = createServerSupabaseClient()

  const { data: staffRows, error: staffError } = await supabase
    .from('staff')
    .select('id, name')
    .eq('department', '事務')
    .eq('active', true)
    .order('display_order', { ascending: true })

  if (staffError) {
    throw new Error(`事務員一覧の取得に失敗しました: ${staffError.message}`)
  }

  const staff = staffRows ?? []
  const staffIds = staff.map((row) => row.id)

  const { data: eventRows, error: eventError } = await supabase
    .from('attendance_events')
    .select('staff_id, action, occurred_at')
    .in('staff_id', staffIds.length > 0 ? staffIds : [NIL_UUID])
    .gte('occurred_at', attendanceLookbackCutoff(new Date()))

  if (eventError) {
    throw new Error(`出退勤イベントの取得に失敗しました: ${eventError.message}`)
  }

  const statusByStaff = attendanceStatusByStaff(
    (eventRows ?? []).map((row) => ({
      staffId: row.staff_id,
      action: row.action as 'clockIn' | 'clockOut',
      occurredAt: row.occurred_at,
    })),
  )

  return staff.map((row) => ({
    staffId: row.id,
    name: row.name,
    status: statusByStaff.get(row.id) ?? 'absent',
  }))
}
```

- [ ] **Step 4: テストを実行し、通ることを確認する**

Run: `pnpm exec vitest run tests/lib/queries/office-staff.test.ts`
Expected: PASS（4 tests）

- [ ] **Step 5: コミット**

```bash
git add lib/queries/office-staff.ts tests/lib/queries/office-staff.test.ts
git commit -m "feat: 事務員を出退勤状態つきで取得するクエリを追加する

Refs #13"
```

---

### Task 6: 事務盤面

**Files:**
- Create: `components/board/office-board.tsx`

**Interfaces:**
- Consumes: `getOfficeStaff` / `OfficeStaffMember`（Task 5）、`NameTag`（`components/ui/name-tag.tsx`、既存）
- Produces: `function OfficeBoard(): Promise<JSX.Element>` — 引数なしの async Server Component

- [ ] **Step 1: 実装を書く**

現場もダンプも持たないので `CollapsibleBoard`（すべて開く／閉じるのツールバー）は付けない。
名前札を並べるだけ。

`components/board/office-board.tsx`:

```tsx
import { getOfficeStaff } from '@/lib/queries/office-staff'
import { NameTag } from '@/components/ui/name-tag'

/**
 * 事務部門の盤面。
 * legacy(webapp/app.js:1176)と同じく、現場・ダンプを持たない氏名+出退勤だけの一覧。
 * 事務員はどの配置枠にも入らないため、「休み」グループは作らない。
 * 休みは「どの配置枠にも居ない人」の概念であり、配置枠を持たない事務には
 * そもそも当てはまらないため。
 */
export async function OfficeBoard() {
  const members = await getOfficeStaff()

  if (members.length === 0) {
    return <p className="text-lg">事務員が登録されていません。</p>
  }

  return (
    <section className="flex flex-col gap-4">
      <h2 className="text-2xl font-bold">事務部門</h2>
      <div className="flex flex-wrap gap-2">
        {members.map((member) => (
          <NameTag key={member.staffId} name={member.name} status={member.status} />
        ))}
      </div>
    </section>
  )
}
```

- [ ] **Step 2: 型チェックを通す**

Run: `pnpm exec tsc --noEmit`
Expected: 出力なし

- [ ] **Step 3: コミット**

```bash
git add components/board/office-board.tsx
git commit -m "feat: 事務盤面を追加する

現場もダンプも持たないため開閉ツールバーは付けず、名前札を並べるだけにする。
事務員は配置枠に入らないので「休み」グループも作らない。

Refs #13"
```

---

### Task 7: 部門ごとの出退勤人数を数えるクエリ

タブ見出しのカウントと、全体確認の各カードが使う。

**Files:**
- Create: `lib/queries/department-attendance.ts`
- Test: `tests/lib/queries/department-attendance.test.ts`

**Interfaces:**
- Consumes: `StaffDepartment`（Task 1）、`attendanceLookbackCutoff` / `attendanceStatusByStaff`（既存）
- Produces:
  - `interface AttendanceCounts { present: number; absent: number }`
  - `function getDepartmentAttendanceCounts(department: StaffDepartment): Promise<AttendanceCounts>`

- [ ] **Step 1: 失敗するテストを書く**

`tests/lib/queries/department-attendance.test.ts`:

```typescript
import { describe, it, expect, vi, beforeEach } from 'vitest'

const mockFrom = vi.fn()

vi.mock('@/lib/supabase/server', () => ({
  createServerSupabaseClient: () => ({ from: mockFrom }),
}))

import { getDepartmentAttendanceCounts } from '@/lib/queries/department-attendance'

// getDepartmentAttendanceCounts は .select('id').eq(...).eq(...) と呼んで await する。
// 2回目の .eq() が Promise を返すようにする。
function staffQuery(rows: { id: string }[]) {
  return {
    select: () => ({
      eq: () => ({
        eq: () => Promise.resolve({ data: rows, error: null }),
      }),
    }),
  }
}

function eventQuery(rows: { staff_id: string; action: string; occurred_at: string }[]) {
  const builder = {
    select: () => builder,
    in: () => builder,
    gte: () => Promise.resolve({ data: rows, error: null }),
  }
  return builder
}

beforeEach(() => {
  mockFrom.mockReset()
})

describe('getDepartmentAttendanceCounts', () => {
  it('出勤中と退勤済みを数える', async () => {
    mockFrom.mockImplementation((table: string) => {
      if (table === 'staff') {
        return staffQuery([{ id: 's1' }, { id: 's2' }, { id: 's3' }])
      }
      return eventQuery([
        { staff_id: 's1', action: 'clockIn', occurred_at: '2026-08-28T00:00:00.000Z' },
        { staff_id: 's2', action: 'clockIn', occurred_at: '2026-08-28T00:00:00.000Z' },
        { staff_id: 's2', action: 'clockOut', occurred_at: '2026-08-28T09:00:00.000Z' },
      ])
    })

    // s1=出勤中 / s2=退勤済み / s3=打刻なし(退勤扱い)
    expect(await getDepartmentAttendanceCounts('土木')).toEqual({ present: 1, absent: 2 })
  })

  it('在籍者が0人なら両方0を返す', async () => {
    mockFrom.mockImplementation((table: string) =>
      table === 'staff' ? staffQuery([]) : eventQuery([]),
    )

    expect(await getDepartmentAttendanceCounts('事務')).toEqual({ present: 0, absent: 0 })
  })
})
```

- [ ] **Step 2: テストを実行し、失敗することを確認する**

Run: `pnpm exec vitest run tests/lib/queries/department-attendance.test.ts`
Expected: FAIL — `Failed to resolve import "@/lib/queries/department-attendance"`

モックビルダの形が合わずに別のエラーで落ちる場合は、`lib/queries/unassigned-staff.ts` の
呼び出し順（`.select().eq().eq()` のあと await）に合わせてモックを直してから進む。

- [ ] **Step 3: 実装を書く**

`lib/queries/department-attendance.ts`:

```typescript
import { createServerSupabaseClient } from '@/lib/supabase/server'
import type { StaffDepartment } from '@/lib/board/department'
import {
  attendanceLookbackCutoff,
  attendanceStatusByStaff,
} from '@/lib/board/attendance-status'

const NIL_UUID = '00000000-0000-0000-0000-000000000000'

export interface AttendanceCounts {
  present: number
  absent: number
}

/**
 * 部門ごとの出勤中・退勤済みの人数。
 * 集計結果は保存せず、毎回 attendance_events から数え直す。
 * 打刻が1件も無い人は退勤扱い。
 */
export async function getDepartmentAttendanceCounts(
  department: StaffDepartment,
): Promise<AttendanceCounts> {
  const supabase = createServerSupabaseClient()

  const { data: staffRows, error: staffError } = await supabase
    .from('staff')
    .select('id')
    .eq('department', department)
    .eq('active', true)

  if (staffError) {
    throw new Error(`${department}の在籍者取得に失敗しました: ${staffError.message}`)
  }

  const staffIds = (staffRows ?? []).map((row) => row.id)

  const { data: eventRows, error: eventError } = await supabase
    .from('attendance_events')
    .select('staff_id, action, occurred_at')
    .in('staff_id', staffIds.length > 0 ? staffIds : [NIL_UUID])
    .gte('occurred_at', attendanceLookbackCutoff(new Date()))

  if (eventError) {
    throw new Error(`出退勤イベントの取得に失敗しました: ${eventError.message}`)
  }

  const statusByStaff = attendanceStatusByStaff(
    (eventRows ?? []).map((row) => ({
      staffId: row.staff_id,
      action: row.action as 'clockIn' | 'clockOut',
      occurredAt: row.occurred_at,
    })),
  )

  let present = 0
  for (const id of staffIds) {
    if ((statusByStaff.get(id) ?? 'absent') === 'present') {
      present += 1
    }
  }

  return { present, absent: staffIds.length - present }
}
```

- [ ] **Step 4: テストを実行し、通ることを確認する**

Run: `pnpm exec vitest run tests/lib/queries/department-attendance.test.ts`
Expected: PASS（2 tests）

- [ ] **Step 5: コミット**

```bash
git add lib/queries/department-attendance.ts tests/lib/queries/department-attendance.test.ts
git commit -m "feat: 部門ごとの出退勤人数を数えるクエリを追加する

Refs #13"
```

---

### Task 8: 稼働配置枠数を数えるクエリ

全体確認の「稼働現場」「稼働配置」に使う。legacy の `deptActiveGroupCount`
（`webapp/app.js:801-810`）と同じ数え方にする。

**Files:**
- Create: `lib/queries/active-slot-count.ts`
- Test: `tests/lib/queries/active-slot-count.test.ts`

**Interfaces:**
- Consumes: `BoardDepartment`（Task 1）
- Produces: `function getActiveSlotCount(department: BoardDepartment): Promise<number>`

- [ ] **Step 1: 失敗するテストを書く**

`tests/lib/queries/active-slot-count.test.ts`:

```typescript
import { describe, it, expect, vi, beforeEach } from 'vitest'

const mockFrom = vi.fn()

vi.mock('@/lib/supabase/server', () => ({
  createServerSupabaseClient: () => ({ from: mockFrom }),
}))

import { getActiveSlotCount } from '@/lib/queries/active-slot-count'

function slotQuery(rows: { id: string }[]) {
  const builder = {
    select: () => builder,
    eq: () => builder,
    is: () => Promise.resolve({ data: rows, error: null }),
  }
  return builder
}

function placementQuery(rows: { slot_id: string }[]) {
  const builder = {
    select: () => builder,
    in: () => Promise.resolve({ data: rows, error: null }),
  }
  return builder
}

beforeEach(() => {
  mockFrom.mockReset()
})

describe('getActiveSlotCount', () => {
  it('人が入っている配置枠だけを数える', async () => {
    mockFrom.mockImplementation((table: string) => {
      if (table === 'placement_slots') return slotQuery([{ id: 'a' }, { id: 'b' }, { id: 'c' }])
      if (table === 'staff_placements') return placementQuery([{ slot_id: 'a' }, { slot_id: 'a' }])
      return placementQuery([])
    })

    // a には人が2人いる。b と c は空なので数えない。
    expect(await getActiveSlotCount('土木')).toBe(1)
  })

  it('運転手なしのダンプが駐車している配置枠も数える', async () => {
    mockFrom.mockImplementation((table: string) => {
      if (table === 'placement_slots') return slotQuery([{ id: 'a' }, { id: 'b' }])
      if (table === 'staff_placements') return placementQuery([{ slot_id: 'a' }])
      return placementQuery([{ slot_id: 'b' }])
    })

    // a=人がいる / b=車だけ駐車 のどちらも稼働扱い
    expect(await getActiveSlotCount('運輸')).toBe(2)
  })

  it('人も車もいない配置枠は数えない', async () => {
    mockFrom.mockImplementation((table: string) => {
      if (table === 'placement_slots') return slotQuery([{ id: 'a' }, { id: 'b' }])
      return placementQuery([])
    })

    expect(await getActiveSlotCount('運輸')).toBe(0)
  })

  it('配置枠が1つも無ければ0を返す', async () => {
    mockFrom.mockImplementation((table: string) =>
      table === 'placement_slots' ? slotQuery([]) : placementQuery([]),
    )

    expect(await getActiveSlotCount('土木')).toBe(0)
  })
})
```

- [ ] **Step 2: テストを実行し、失敗することを確認する**

Run: `pnpm exec vitest run tests/lib/queries/active-slot-count.test.ts`
Expected: FAIL — `Failed to resolve import "@/lib/queries/active-slot-count"`

- [ ] **Step 3: 実装を書く**

`lib/queries/active-slot-count.ts`:

```typescript
import { createServerSupabaseClient } from '@/lib/supabase/server'
import type { BoardDepartment } from '@/lib/board/department'

/**
 * 稼働中の配置枠の数。
 * legacy の deptActiveGroupCount(webapp/app.js:801-810)と同じ数え方で、
 * 「人が1人以上入っている枠」または「運転手なしのダンプが駐車している枠」を数える。
 * 空の枠は数えない。作っただけで誰も入っていない枠を稼働として見せないため。
 */
export async function getActiveSlotCount(department: BoardDepartment): Promise<number> {
  const supabase = createServerSupabaseClient()

  const { data: slotRows, error: slotError } = await supabase
    .from('placement_slots')
    .select('id')
    .eq('department', department)
    .is('ended_at', null)

  if (slotError) {
    throw new Error(`${department}の配置枠取得に失敗しました: ${slotError.message}`)
  }

  const slotIds = (slotRows ?? []).map((row) => row.id)
  if (slotIds.length === 0) {
    return 0
  }

  const { data: staffRows, error: staffError } = await supabase
    .from('staff_placements')
    .select('slot_id')
    .in('slot_id', slotIds)

  if (staffError) {
    throw new Error(`配置中の人員取得に失敗しました: ${staffError.message}`)
  }

  // slotIds が空のときは上で早期リターンしているので、ここでは必ず1件以上ある。
  const { data: vehicleRows, error: vehicleError } = await supabase
    .from('vehicle_placements')
    .select('slot_id')
    .in('slot_id', slotIds)

  if (vehicleError) {
    throw new Error(`駐車中の車両取得に失敗しました: ${vehicleError.message}`)
  }

  const occupied = new Set<string>()
  for (const row of staffRows ?? []) {
    if (row.slot_id !== null) occupied.add(row.slot_id)
  }
  for (const row of vehicleRows ?? []) {
    if (row.slot_id !== null) occupied.add(row.slot_id)
  }

  return slotIds.filter((id) => occupied.has(id)).length
}
```

- [ ] **Step 4: テストを実行し、通ることを確認する**

Run: `pnpm exec vitest run tests/lib/queries/active-slot-count.test.ts`
Expected: PASS（4 tests）

- [ ] **Step 5: コミット**

```bash
git add lib/queries/active-slot-count.ts tests/lib/queries/active-slot-count.test.ts
git commit -m "feat: 稼働中の配置枠数を数えるクエリを追加する

legacy の deptActiveGroupCount に合わせ、人が入っている枠と運転手なしの
ダンプが駐車している枠を数える。空の枠は数えない。

Refs #13"
```

---

### Task 9: 全体確認のカード

カード1枚 = 1コンポーネント = 1 Suspense 境界にする。運輸カードは車両6種の集計を伴って
最も重いため、束ねると土木・事務のカード表示まで止まる。

**Files:**
- Create: `components/board/summary-card.tsx`（見た目だけの箱。フェッチしない）
- Create: `components/board/summary-doboku-card.tsx`
- Create: `components/board/summary-unyu-card.tsx`
- Create: `components/board/summary-office-card.tsx`
- Create: `components/board/summary-board.tsx`

**Interfaces:**
- Consumes: `getDepartmentAttendanceCounts`（Task 7）、`getActiveSlotCount`（Task 8）、
  `getVehicleSummary`（`lib/queries/vehicle-summary.ts`、既存。`{ counts: Record<VehicleCategory, number>, total: number }` を返す）、
  `TabKey`（Task 1）
- Produces: `function SummaryBoard(): JSX.Element`（同期。中で3つの Suspense を張る）

- [ ] **Step 1: カードの器を書く**

`components/board/summary-card.tsx`:

```tsx
import Link from 'next/link'
import type { TabKey } from '@/lib/board/department'

export interface SummaryStat {
  label: string
  value: string
}

/**
 * 全体確認のカード1枚。データ取得はせず、見た目だけを持つ。
 * 取得は部門ごとのカードコンポーネントが各自で行う。
 */
export function SummaryCard({
  title,
  stats,
  openTab,
}: {
  title: string
  stats: SummaryStat[]
  openTab: TabKey
}) {
  return (
    <div className="flex w-72 flex-col gap-3 rounded-lg border border-black/15 p-4 dark:border-white/20">
      <p className="text-xl font-bold">{title}</p>
      <dl className="flex flex-col gap-1">
        {stats.map((stat) => (
          <div key={stat.label} className="flex justify-between text-lg">
            <dt>{stat.label}</dt>
            <dd className="tabular-nums">{stat.value}</dd>
          </div>
        ))}
      </dl>
      <Link
        href={`/?dept=${openTab}`}
        className="flex min-h-14 items-center justify-center rounded-lg bg-black/5 text-lg hover:bg-black/10 dark:bg-white/10 dark:hover:bg-white/20"
      >
        {title}を開く
      </Link>
    </div>
  )
}
```

- [ ] **Step 2: 3つの部門カードを書く**

`components/board/summary-doboku-card.tsx`:

```tsx
import { getDepartmentAttendanceCounts } from '@/lib/queries/department-attendance'
import { getActiveSlotCount } from '@/lib/queries/active-slot-count'
import { SummaryCard } from './summary-card'

export async function SummaryDobokuCard() {
  const attendance = await getDepartmentAttendanceCounts('土木')
  const activeSlots = await getActiveSlotCount('土木')

  return (
    <SummaryCard
      title="土木"
      openTab="doboku"
      stats={[
        { label: '出勤', value: `${attendance.present}人` },
        { label: '退勤', value: `${attendance.absent}人` },
        { label: '稼働現場', value: `${activeSlots}箇所` },
      ]}
    />
  )
}
```

`components/board/summary-unyu-card.tsx`:

```tsx
import { getDepartmentAttendanceCounts } from '@/lib/queries/department-attendance'
import { getActiveSlotCount } from '@/lib/queries/active-slot-count'
import { getVehicleSummary } from '@/lib/queries/vehicle-summary'
import { SummaryCard } from './summary-card'

export async function SummaryUnyuCard() {
  const attendance = await getDepartmentAttendanceCounts('運輸')
  const activeSlots = await getActiveSlotCount('運輸')
  const vehicles = await getVehicleSummary()

  return (
    <SummaryCard
      title="運輸"
      openTab="unyu"
      stats={[
        { label: '出勤', value: `${attendance.present}人` },
        { label: '退勤', value: `${attendance.absent}人` },
        { label: '稼働配置', value: `${activeSlots}枠` },
        { label: '使用中', value: `${vehicles.counts.使用中}台` },
        { label: '空車', value: `${vehicles.counts.空車}台` },
        { label: '整備', value: `${vehicles.counts.整備}台` },
        { label: '車検', value: `${vehicles.counts.車検}台` },
        { label: '故障', value: `${vehicles.counts.故障}台` },
        { label: '使用停止', value: `${vehicles.counts.使用停止}台` },
      ]}
    />
  )
}
```

`components/board/summary-office-card.tsx`:

```tsx
import { getDepartmentAttendanceCounts } from '@/lib/queries/department-attendance'
import { SummaryCard } from './summary-card'

export async function SummaryOfficeCard() {
  const attendance = await getDepartmentAttendanceCounts('事務')

  return (
    <SummaryCard
      title="事務"
      openTab="office"
      stats={[
        { label: '出勤', value: `${attendance.present}人` },
        { label: '退勤', value: `${attendance.absent}人` },
      ]}
    />
  )
}
```

- [ ] **Step 3: カードを並べる**

`components/board/summary-board.tsx`:

```tsx
import { Suspense } from 'react'
import { SummaryDobokuCard } from './summary-doboku-card'
import { SummaryUnyuCard } from './summary-unyu-card'
import { SummaryOfficeCard } from './summary-office-card'

/**
 * 全体確認タブ。
 * カード1枚 = 1 Suspense 境界にしている。運輸カードは車両6種の集計を伴って
 * 最も重く、束ねると土木・事務のカード表示まで止まってしまうため。
 */
export function SummaryBoard() {
  return (
    <section className="flex flex-col gap-4">
      <h2 className="text-2xl font-bold">全体確認</h2>
      <div className="flex flex-wrap items-start gap-4">
        <Suspense fallback={<p>土木の集計を読み込み中...</p>}>
          <SummaryDobokuCard />
        </Suspense>
        <Suspense fallback={<p>運輸の集計を読み込み中...</p>}>
          <SummaryUnyuCard />
        </Suspense>
        <Suspense fallback={<p>事務の集計を読み込み中...</p>}>
          <SummaryOfficeCard />
        </Suspense>
      </div>
    </section>
  )
}
```

- [ ] **Step 4: 型チェックを通す**

Run: `pnpm exec tsc --noEmit`
Expected: 出力なし

- [ ] **Step 5: コミット**

```bash
git add components/board/summary-card.tsx components/board/summary-doboku-card.tsx components/board/summary-unyu-card.tsx components/board/summary-office-card.tsx components/board/summary-board.tsx
git commit -m "feat: 全体確認の集計カードを追加する

カード1枚=1Suspense境界にする。運輸カードは車両6種の集計を伴って最も重く、
束ねると土木・事務のカード表示まで止まるため。

Refs #13"
```

---

### Task 10: タブバー

**Files:**
- Create: `components/board/department-tab-counts.tsx`
- Create: `components/board/department-tab-bar.tsx`

**Interfaces:**
- Consumes: `TAB_KEYS` / `TabKey` / `tabLabel` / `departmentOfTab`（Task 1）、
  `getDepartmentAttendanceCounts`（Task 7）、`getVehicleSummary`（既存）
- Produces: `function DepartmentTabBar({ current }: { current: TabKey }): JSX.Element`

- [ ] **Step 1: カウント部分を書く**

3部門ぶんの集計が要るので、盤面本体を待たせないよう独立したコンポーネントに切る。
呼び出し側が Suspense で包む。

`components/board/department-tab-counts.tsx`:

```tsx
import { getDepartmentAttendanceCounts } from '@/lib/queries/department-attendance'
import { getVehicleSummary } from '@/lib/queries/vehicle-summary'
import { departmentOfTab, type TabKey } from '@/lib/board/department'

/**
 * タブ見出しに出す出勤・退勤の人数。legacy の renderTabCounts(webapp/app.js:817-825)相当。
 * 全体確認タブにはカウントを出さない(legacyも出していない)。
 */
export async function DepartmentTabCounts({ tab }: { tab: TabKey }) {
  const department = departmentOfTab(tab)
  if (department === null) {
    return null
  }

  const attendance = await getDepartmentAttendanceCounts(department)

  if (department !== '運輸') {
    return (
      <span className="text-sm">
        出勤{attendance.present}／退勤{attendance.absent}
      </span>
    )
  }

  const vehicles = await getVehicleSummary()
  return (
    <span className="text-sm">
      出勤{attendance.present}／退勤{attendance.absent}／使用{vehicles.counts.使用中}台
    </span>
  )
}
```

- [ ] **Step 2: タブバー本体を書く**

`components/board/department-tab-bar.tsx`:

```tsx
import { Suspense } from 'react'
import Link from 'next/link'
import { TAB_KEYS, tabLabel, type TabKey } from '@/lib/board/department'
import { DepartmentTabCounts } from './department-tab-counts'

/**
 * 部門タブ。選択状態は ?dept= としてURLに持たせるため、クライアント状態を持たない。
 * リロードしても同じタブに戻り、選択中の部門のクエリだけが走る。
 */
export function DepartmentTabBar({ current }: { current: TabKey }) {
  return (
    <nav aria-label="部門切替" className="flex flex-wrap gap-2">
      {TAB_KEYS.map((tab) => {
        const isCurrent = tab === current
        return (
          <Link
            key={tab}
            href={`/?dept=${tab}`}
            aria-current={isCurrent ? 'page' : undefined}
            // タッチモニター運用のため、指で確実に押せる大きさにする。
            className={`flex min-h-16 min-w-32 flex-col items-center justify-center rounded-lg px-4 ${
              isCurrent
                ? 'bg-foreground text-background'
                : 'bg-black/5 hover:bg-black/10 dark:bg-white/10 dark:hover:bg-white/20'
            }`}
          >
            <span className="text-xl font-bold">{tabLabel(tab)}</span>
            <Suspense fallback={<span className="text-sm">集計中...</span>}>
              <DepartmentTabCounts tab={tab} />
            </Suspense>
          </Link>
        )
      })}
    </nav>
  )
}
```

- [ ] **Step 3: 型チェックを通す**

Run: `pnpm exec tsc --noEmit`
Expected: 出力なし

- [ ] **Step 4: コミット**

```bash
git add components/board/department-tab-bar.tsx components/board/department-tab-counts.tsx
git commit -m "feat: 部門タブバーを追加する

選択状態は ?dept= としてURLに持たせ、クライアント状態を持たない。
タブ見出しのカウントは3部門ぶんの集計が要るので、盤面本体を待たせないよう
独立したSuspense境界に入れる。

Refs #13"
```

---

### Task 11: 盤面ページをタブ構成に組み替える

**Files:**
- Modify: `app/page.tsx`（全面差し替え）

**Interfaces:**
- Consumes: `resolveTabKey` / `TabKey`（Task 1）、`DepartmentTabBar`（Task 10）、
  `OfficeBoard`（Task 6）、`SummaryBoard`（Task 9）、`DepartmentBoard`（既存）、
  `ClockHeader` / `RealtimeBoardWatcher`（既存）
- Produces: `/` と `/?dept=<key>` が4タブで動く

- [ ] **Step 1: page.tsx を書き換える**

`app/page.tsx` を丸ごと差し替える。`export const dynamic = 'force-dynamic'` は
**必ず残す**（消すと Realtime の `router.refresh()` が本番で効かなくなる）。

```tsx
import { ClockHeader } from '@/components/board/clock-header'
import { RealtimeBoardWatcher } from '@/components/board/realtime-board-watcher'
import { DepartmentBoard } from '@/components/board/department-board'
import { DepartmentTabBar } from '@/components/board/department-tab-bar'
import { OfficeBoard } from '@/components/board/office-board'
import { SummaryBoard } from '@/components/board/summary-board'
import { resolveTabKey } from '@/lib/board/department'

// 複数端末でリアルタイム同期する盤面のため、ビルド時に静的化させず毎回サーバでレンダリングする。
// 静的化されると RealtimeBoardWatcher の router.refresh() が本番で無意味になる。
export const dynamic = 'force-dynamic'

export default async function BoardPage({ searchParams }: PageProps<'/'>) {
  // Next.js 16 では searchParams が Promise。
  const params = await searchParams
  const tab = resolveTabKey(params.dept)

  return (
    <main className="flex flex-col gap-8 p-4">
      <ClockHeader />
      <RealtimeBoardWatcher />
      <DepartmentTabBar current={tab} />

      {tab === 'doboku' && <DepartmentBoard department="土木" />}
      {tab === 'unyu' && <DepartmentBoard department="運輸" />}
      {tab === 'office' && <OfficeBoard />}
      {tab === 'summary' && <SummaryBoard />}
    </main>
  )
}
```

- [ ] **Step 2: 型チェックを通す**

Run: `pnpm exec tsc --noEmit`
Expected: 出力なし

`PageProps<'/'>` が使えない場合は、Next.js 16 の型生成が古い可能性がある。
`pnpm build` を一度流して `.next/types` を作り直してから再実行する。

- [ ] **Step 3: ビルドが通ることを確認する**

Run: `pnpm build`
Expected: 成功し、Route 一覧で `/` が `ƒ (Dynamic)` のままであること

`○ (Static)` になっていたら `export const dynamic = 'force-dynamic'` が消えている。戻すこと。

- [ ] **Step 4: 既存のE2Eがまだ通ることを確認する**

Run: `pnpm exec playwright test tests/e2e/board.spec.ts --reporter=list`
Expected: 2 passed

既存の board.spec.ts は `/` を開いて土木の現場を見る。`?dept=` 未指定は土木に
フォールバックするので、そのまま通るはず。落ちた場合はフォールバックの実装を疑う。

- [ ] **Step 5: コミット**

```bash
git add app/page.tsx
git commit -m "feat: 盤面を部門タブ構成に組み替える

?dept= をServer Componentで読み、選択中のタブの盤面だけをレンダリングする。
見ていない部門のクエリは走らない。

Refs #13"
```

---

### Task 12: E2E

**Files:**
- Create: `tests/e2e/department-tabs.spec.ts`

**Interfaces:**
- Consumes: Task 11 までの全実装
- Produces: なし（検証のみ）

- [ ] **Step 1: 失敗するテストを書く**

事務員はTask 4 で本物のDBに入れているので、E2E側でのデータ準備は不要。
既存の `tests/e2e/board.spec.ts` のように `TEST_` プレフィックスのデータを作る必要もない。

`tests/e2e/department-tabs.spec.ts`:

```typescript
import { test, expect } from '@playwright/test'

test.describe('部門タブ', () => {
  test('初期表示は土木タブになる', async ({ page }) => {
    await page.goto('/')
    await page.waitForLoadState('networkidle')

    const tabs = page.getByRole('navigation', { name: '部門切替' })
    await expect(tabs.getByRole('link', { name: /土木/ })).toHaveAttribute('aria-current', 'page')
    await expect(page.getByRole('heading', { name: '土木部門' })).toBeVisible()
  })

  test('未知のdeptは土木タブに落とす', async ({ page }) => {
    await page.goto('/?dept=存在しない部門')
    await page.waitForLoadState('networkidle')

    await expect(page.getByRole('heading', { name: '土木部門' })).toBeVisible()
  })

  test('事務タブに切り替えるとURLと内容が変わる', async ({ page }) => {
    await page.goto('/')
    await page.waitForLoadState('networkidle')

    await page.getByRole('navigation', { name: '部門切替' }).getByRole('link', { name: /事務/ }).click()

    await expect(page).toHaveURL(/\?dept=office/)
    await expect(page.getByRole('heading', { name: '事務部門' })).toBeVisible()
    // seedで投入した事務員が出ていること
    await expect(page.getByText('黒瀬とも美', { exact: false })).toBeVisible()
    // 事務は現場を持たないので、土木部門の見出しは消えていること
    await expect(page.getByRole('heading', { name: '土木部門' })).toBeHidden()
  })

  test('全体確認タブに3部門のカードが出る', async ({ page }) => {
    await page.goto('/?dept=summary')
    await page.waitForLoadState('networkidle')

    await expect(page.getByRole('heading', { name: '全体確認' })).toBeVisible()
    await expect(page.getByRole('link', { name: '土木を開く' })).toBeVisible()
    await expect(page.getByRole('link', { name: '運輸を開く' })).toBeVisible()
    await expect(page.getByRole('link', { name: '事務を開く' })).toBeVisible()
  })

  test('全体確認のカードから部門タブへ飛べる', async ({ page }) => {
    await page.goto('/?dept=summary')
    await page.waitForLoadState('networkidle')

    await page.getByRole('link', { name: '運輸を開く' }).click()

    await expect(page).toHaveURL(/\?dept=unyu/)
    await expect(page.getByRole('heading', { name: '運輸部門' })).toBeVisible()
  })
})
```

- [ ] **Step 2: テストを実行して通ることを確認する**

Run: `pnpm exec playwright test tests/e2e/department-tabs.spec.ts --reporter=list`
Expected: 5 passed

落ちる場合は、実装ではなくセレクタの問題であることが多い。
`--debug` を付けるか、`page.screenshot()` を挟んで実際のDOMを確認してから直すこと。

- [ ] **Step 3: コミット**

```bash
git add tests/e2e/department-tabs.spec.ts
git commit -m "test: 部門タブのE2Eを追加する

Refs #13"
```

---

### Task 13: 全体検証とPR

**Files:**
- なし（検証のみ）

**Interfaces:**
- Consumes: Task 1〜12 のすべて
- Produces: PR

- [ ] **Step 1: 単体テストを全部流す**

Run: `pnpm test`
Expected: PASS（既存37 + Task 1の8 + Task 5の4 + Task 7の2 + Task 8の4 = 55 tests）

- [ ] **Step 2: E2Eを全部流す**

Run: `pnpm exec playwright test --reporter=list`
Expected: PASS（既存の board 2 + app-shell 2 + 新規 department-tabs 5 = 9 tests）

- [ ] **Step 3: 型チェックとビルド**

Run: `pnpm exec tsc --noEmit`
Expected: 出力なし

Run: `pnpm build`
Expected: 成功。`/` が `ƒ (Dynamic)` のまま

- [ ] **Step 4: lint**

Run: `pnpm lint`
Expected: **既存の2件のみ**
- `components/board/clock-header.tsx:20` の `react-hooks/set-state-in-effect`（エラー）
- `components/board/site-group-card.tsx:10` の未使用変数（警告）

新しい指摘が増えていたら直す。既存2件はこのissueのスコープ外なので触らない。

- [ ] **Step 5: 画面を目視確認する**

Run: `pnpm exec next dev --port 3100`

ブラウザで以下を確認する（別ターミナルで起動し、確認後に止める）:
- `/` → 土木タブが選択状態。タブ見出しに「出勤N／退勤M」が出る
- 運輸タブ → 使用台数も出る。車両札と空車が見える
- 事務タブ → 4名の名前札が縦書きで並ぶ。現場札もダンプ札も出ない
- 全体確認タブ → 3枚のカード。運輸カードだけ車両6種の行がある
- 「運輸を開く」→ 運輸タブに飛ぶ
- リロードしてもタブが維持される

- [ ] **Step 6: プッシュしてPRを作る**

```bash
git push -u origin feature/13-department-tabs
gh pr create --base dev --head feature/13-department-tabs --title "盤面を部門タブ化し、事務部門と全体確認を移植する" --body "Closes #13

## やったこと

盤面を土木・運輸・事務・全体確認の4タブ構成にし、legacy にあって新実装から
欠けていた事務部門と全体確認を移植した。

事務の欠落は移植漏れではなく意図的な除外だった（\`scripts/seed-master-data.mjs:10\`
に根拠のコメントがあった）。今回それを覆している。

## 設計上のポイント

- タブの選択状態は \`?dept=\` としてURLに持たせ、クライアント状態を持たない。
  リロードでタブが維持され、選択中の部門のクエリだけが走る
- \`placement_slots.department\` には事務を**追加していない**。事務員は現場にも
  配置枠にも入らないため、DBのCHECK制約と TypeScript の型（\`BoardDepartment\` /
  \`StaffDepartment\`）の両方で塞いだままにしている
- タブ見出しのカウントと全体確認のカードは、それぞれ独立したSuspense境界に置いた

詳細は \`docs/superpowers/specs/2026-08-28-department-tabs-design.md\` を参照。

## 検証

| 項目 | 結果 |
| --- | --- |
| \`pnpm test\` | 55 passed |
| \`pnpm exec playwright test\` | 9 passed |
| \`pnpm exec tsc --noEmit\` | エラーなし |
| \`pnpm build\` | 成功。\`/\` は ƒ Dynamic を維持 |
| \`pnpm lint\` | 既存2件のみ。新規増加なし |

🤖 Generated with [Claude Code](https://claude.com/claude-code)
"
```
