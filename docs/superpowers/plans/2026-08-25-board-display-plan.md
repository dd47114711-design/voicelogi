# 配車・出退勤ボード 盤面表示（読み取り専用） Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** legacy/webappの配車・出退勤ボードの盤面表示（現場グループ・特殊グループ・出退勤状態表示・縦書き・折りたたみ・Realtime同期）を、書き込み系操作を含まない読み取り専用のNext.js画面として実装する。

**Architecture:** Next.js App RouterのServer Componentツリーで、DBフェッチ1単位=1コンポーネント=1 Suspense境界を徹底する。配置枠一覧を軽量に取得する親コンポーネントが`slotId`だけを子に渡し、各カード・各特殊グループが自分のデータを個別取得する。折りたたみはクライアント側のローカルstate、複数端末同期はSupabase Realtimeの購読 + `router.refresh()`で実現する。

**Tech Stack:** Next.js 16 (App Router) / React 19 / TypeScript strict / Tailwind CSS v4 / supabase-js / Vitest / Playwright（本issueで新規導入）

**Spec:** `docs/superpowers/specs/2026-08-25-board-display-design.md`

## Global Constraints

- DBフェッチ1単位=1コンポーネント=1 Suspense境界。`Promise.all`で複数フェッチを束ねない。
- 既定はServer Component。`"use client"`は実際にstate・イベントハンドラ・ブラウザAPIが要るコンポーネントにだけ付ける。
- TypeScript `strict: true`。`any`を使わない。
- 現場名で人・車両をグルーピングしない。必ず配置枠ID（`slot_id`）を介して分類する。
- 配置枠(`slot_id`)に入っている人は、退勤しても配置枠のレーンに残ったまま名前札の色が白→赤に変わるだけ。「休み」「現場未定」は`slot_id is null`の人だけが対象。
- 折りたたみの開閉状態は保存しない（ページ再読み込みで初期状態=全展開に戻る）。
- 集計値（車両summary・人数など）は保存せず、常にクエリ時に導出する。
- コミットメッセージ・コメント・UI文言はすべて日本語。
- `pnpm`を使う。テストは`.env.local`の`NEXT_PUBLIC_SUPABASE_URL` / `SUPABASE_SERVICE_ROLE_KEY`で実際のSupabaseプロジェクトに接続する（ローカルDocker DBは使わない）。DB統合テストは`TEST_`接頭辞のデータのみ作成し、`afterAll`で必ず削除する（既存の`tests/global-setup.ts`が残骸を掃除するが、それに頼らず自分で片付ける）。

---

### Task 1: マイグレーション追加とSupabase型再生成

配置枠(`placement_slots`)に部門を持たせる。現行スキーマでは「共通」区分の現場が土木配置枠・運輸配置枠を同時に持てず、盤面の表示先部門を判定できないため。

**Files:**
- Create: `supabase/migrations/0004_placement_department.sql`
- Modify: `lib/supabase/database.types.ts`（`pnpm db:types`で自動生成、手編集しない）

**Interfaces:**
- Produces: `placement_slots.department`列（`'土木' | '運輸'`、NOT NULL）。以降の全クエリタスクがこれに依存する。

- [ ] **Step 1: マイグレーションファイルを作成**

```sql
-- placement_slots に部門を追加する。
-- 「共通」区分の現場は土木配置枠・運輸配置枠が同時に別々に存在しうるため、
-- site.category だけでは配置枠の表示先部門を判定できない。配置枠自身に
-- 部門を持たせる（legacyのdispatchGroups.departmentに相当）。

alter table placement_slots
  add column department text not null check (department in ('土木', '運輸'));

create index placement_slots_department_idx on placement_slots (department);
```

保存先: `supabase/migrations/0004_placement_department.sql`

- [ ] **Step 2: マイグレーションを適用**

Run: `npx supabase db push`
Expected: `0004_placement_department.sql`が適用され、成功メッセージが出る。

- [ ] **Step 3: Supabase型を再生成**

Run: `pnpm db:types`
Expected: `lib/supabase/database.types.ts`の`placement_slots`の`Row`/`Insert`/`Update`に`department: string`が追加される。差分を確認する。

- [ ] **Step 4: 既存テストがまだ通ることを確認**

Run: `pnpm test`
Expected: 既存の`tests/db/*.test.ts`・`tests/lib/*.test.ts`がすべてPASS（`placement_slots`への既存インサートで`department`未指定のものがあればここで失敗するので、失敗した場合は該当テストに`department`を追加する）。

- [ ] **Step 5: コミット**

```bash
git add supabase/migrations/0004_placement_department.sql lib/supabase/database.types.ts
git commit -m "$(cat <<'EOF'
placement_slotsに部門(department)列を追加

「共通」区分の現場は土木配置枠・運輸配置枠が同時に別々に存在しうるため、
site.categoryだけでは配置枠の表示先部門を判定できないギャップがあった。
配置枠自身に部門を持たせて解消する。
EOF
)"
```

---

### Task 2: 丸数字ヘルパー（circledNumber）

フェアロード①②③のような丸数字表示をlegacyの`CIRCLED_NUMS`から移植する。純粋関数、DB非依存。

**Files:**
- Create: `lib/board/circled-number.ts`
- Test: `tests/lib/board/circled-number.test.ts`

**Interfaces:**
- Produces: `circledNumber(n: number): string`。Task 3が使用する。

- [ ] **Step 1: 失敗するテストを書く**

```ts
import { describe, expect, it } from 'vitest'
import { circledNumber } from '@/lib/board/circled-number'

describe('circledNumber', () => {
  it('1から20までは丸数字を返す', () => {
    expect(circledNumber(1)).toBe('①')
    expect(circledNumber(3)).toBe('③')
    expect(circledNumber(20)).toBe('⑳')
  })

  it('21以上は括弧付き数字にフォールバックする', () => {
    expect(circledNumber(21)).toBe('(21)')
  })
})
```

保存先: `tests/lib/board/circled-number.test.ts`

- [ ] **Step 2: テストが失敗することを確認**

Run: `pnpm test circled-number`
Expected: FAIL（`Cannot find module '@/lib/board/circled-number'`）

- [ ] **Step 3: 実装する**

```ts
const CIRCLED_NUMBERS = [
  '①', '②', '③', '④', '⑤', '⑥', '⑦', '⑧', '⑨', '⑩',
  '⑪', '⑫', '⑬', '⑭', '⑮', '⑯', '⑰', '⑱', '⑲', '⑳',
] as const

export function circledNumber(n: number): string {
  if (n >= 1 && n <= CIRCLED_NUMBERS.length) {
    return CIRCLED_NUMBERS[n - 1]
  }
  return `(${n})`
}
```

保存先: `lib/board/circled-number.ts`

- [ ] **Step 4: テストが通ることを確認**

Run: `pnpm test circled-number`
Expected: PASS

- [ ] **Step 5: コミット**

```bash
git add lib/board/circled-number.ts tests/lib/board/circled-number.test.ts
git commit -m "$(cat <<'EOF'
丸数字ヘルパー(circledNumber)を追加

フェアロード①②③のような配置枠の丸数字表示に使う。legacyのCIRCLED_NUMS
テーブルを移植した純粋関数。
EOF
)"
```

---

### Task 3: 配置枠へのラベル付与（assignGroupLabels）

`site_id + department`ごとに開設順（`opened_at`昇順）で連番を振り、`現場名 + 丸数字`のラベルを付ける。終了済みの配置枠を含めた全履歴に対して採番するため、古い配置枠が終了しても番号がずれない。

**Files:**
- Create: `lib/board/group-labels.ts`
- Test: `tests/lib/board/group-labels.test.ts`

**Interfaces:**
- Consumes: `circledNumber(n: number): string`（Task 2）
- Produces: `RawSlot`, `LabeledSlot`型、`assignGroupLabels(slots: RawSlot[]): LabeledSlot[]`。Task 6（`getSiteGroupList`）が使用する。

```ts
export interface RawSlot {
  slotId: string
  siteId: string
  siteName: string
  department: '土木' | '運輸'
  openedAt: string
  endedAt: string | null
}

export interface LabeledSlot extends RawSlot {
  label: string
}
```

- [ ] **Step 1: 失敗するテストを書く**

```ts
import { describe, expect, it } from 'vitest'
import { assignGroupLabels, type RawSlot } from '@/lib/board/group-labels'

function slot(overrides: Partial<RawSlot>): RawSlot {
  return {
    slotId: 'slot-default',
    siteId: 'site-a',
    siteName: '永順',
    department: '運輸',
    openedAt: '2026-01-01T00:00:00Z',
    endedAt: null,
    ...overrides,
  }
}

describe('assignGroupLabels', () => {
  it('同じ現場・同じ部門の配置枠に開設順で丸数字を振る', () => {
    const slots = [
      slot({ slotId: 's2', openedAt: '2026-01-02T00:00:00Z' }),
      slot({ slotId: 's1', openedAt: '2026-01-01T00:00:00Z' }),
    ]

    const labeled = assignGroupLabels(slots)

    expect(labeled.find((s) => s.slotId === 's1')?.label).toBe('永順①')
    expect(labeled.find((s) => s.slotId === 's2')?.label).toBe('永順②')
  })

  it('部門が違えば別カウントになる', () => {
    const slots = [
      slot({ slotId: 's1', department: '運輸', openedAt: '2026-01-01T00:00:00Z' }),
      slot({ slotId: 's2', department: '土木', openedAt: '2026-01-02T00:00:00Z' }),
    ]

    const labeled = assignGroupLabels(slots)

    expect(labeled.find((s) => s.slotId === 's1')?.label).toBe('永順①')
    expect(labeled.find((s) => s.slotId === 's2')?.label).toBe('永順①')
  })

  it('終了済みの配置枠を含めて番号を振るため、間が抜けても番号はずれない', () => {
    const slots = [
      slot({ slotId: 's1', openedAt: '2026-01-01T00:00:00Z', endedAt: '2026-01-02T00:00:00Z' }),
      slot({ slotId: 's2', openedAt: '2026-01-03T00:00:00Z', endedAt: null }),
    ]

    const labeled = assignGroupLabels(slots)

    expect(labeled.find((s) => s.slotId === 's2')?.label).toBe('永順②')
  })
})
```

保存先: `tests/lib/board/group-labels.test.ts`

- [ ] **Step 2: テストが失敗することを確認**

Run: `pnpm test group-labels`
Expected: FAIL（モジュールが存在しない）

- [ ] **Step 3: 実装する**

```ts
import { circledNumber } from './circled-number'

export interface RawSlot {
  slotId: string
  siteId: string
  siteName: string
  department: '土木' | '運輸'
  openedAt: string
  endedAt: string | null
}

export interface LabeledSlot extends RawSlot {
  label: string
}

export function assignGroupLabels(slots: RawSlot[]): LabeledSlot[] {
  const sortedByOpenedAt = [...slots].sort(
    (a, b) => new Date(a.openedAt).getTime() - new Date(b.openedAt).getTime(),
  )

  const sequenceBySlotId = new Map<string, number>()
  const counters = new Map<string, number>()

  for (const slot of sortedByOpenedAt) {
    const key = `${slot.department}|${slot.siteId}`
    const next = (counters.get(key) ?? 0) + 1
    counters.set(key, next)
    sequenceBySlotId.set(slot.slotId, next)
  }

  return slots.map((slot) => ({
    ...slot,
    label: `${slot.siteName}${circledNumber(sequenceBySlotId.get(slot.slotId) as number)}`,
  }))
}
```

保存先: `lib/board/group-labels.ts`

- [ ] **Step 4: テストが通ることを確認**

Run: `pnpm test group-labels`
Expected: PASS

- [ ] **Step 5: コミット**

```bash
git add lib/board/group-labels.ts tests/lib/board/group-labels.test.ts
git commit -m "$(cat <<'EOF'
配置枠への丸数字ラベル付与(assignGroupLabels)を追加

site_id+departmentごとの開設順で連番を振る。終了済みの配置枠を含めた
全履歴に対して採番するため、古い配置枠が終了しても番号がずれない
(legacyのnextGroupSequenceと同じ挙動)。
EOF
)"
```

---

### Task 4: 出退勤ステータス判定（currentAttendanceStatus / attendanceStatusByStaff）

`attendance_events`の最新イベントから、その人が現在「出勤中」か「退勤中」かを判定する純粋関数。イベントが1件も無い人は「退勤中」扱いとする。

**Files:**
- Create: `lib/board/attendance-status.ts`
- Test: `tests/lib/board/attendance-status.test.ts`

**Interfaces:**
- Produces:
  - `type AttendanceStatus = 'present' | 'absent'`
  - `interface AttendanceEvent { action: 'clockIn' | 'clockOut'; occurredAt: string }`
  - `interface AttendanceEventRecord extends AttendanceEvent { staffId: string }`
  - `currentAttendanceStatus(events: AttendanceEvent[]): AttendanceStatus`
  - `attendanceStatusByStaff(events: AttendanceEventRecord[]): Map<string, AttendanceStatus>`
  - Task 7, 8で使用する。

- [ ] **Step 1: 失敗するテストを書く**

```ts
import { describe, expect, it } from 'vitest'
import { attendanceStatusByStaff, currentAttendanceStatus } from '@/lib/board/attendance-status'

describe('currentAttendanceStatus', () => {
  it('イベントが無ければ退勤中(absent)扱い', () => {
    expect(currentAttendanceStatus([])).toBe('absent')
  })

  it('最新イベントがclockInなら出勤中(present)', () => {
    const status = currentAttendanceStatus([
      { action: 'clockOut', occurredAt: '2026-08-25T00:00:00Z' },
      { action: 'clockIn', occurredAt: '2026-08-25T08:00:00Z' },
    ])
    expect(status).toBe('present')
  })

  it('最新イベントがclockOutなら退勤中(absent)', () => {
    const status = currentAttendanceStatus([
      { action: 'clockIn', occurredAt: '2026-08-25T08:00:00Z' },
      { action: 'clockOut', occurredAt: '2026-08-25T17:00:00Z' },
    ])
    expect(status).toBe('absent')
  })
})

describe('attendanceStatusByStaff', () => {
  it('staffIdごとに最新ステータスを集計する', () => {
    const result = attendanceStatusByStaff([
      { staffId: 'a', action: 'clockIn', occurredAt: '2026-08-25T08:00:00Z' },
      { staffId: 'b', action: 'clockIn', occurredAt: '2026-08-25T08:00:00Z' },
      { staffId: 'b', action: 'clockOut', occurredAt: '2026-08-25T17:00:00Z' },
    ])

    expect(result.get('a')).toBe('present')
    expect(result.get('b')).toBe('absent')
    expect(result.get('c')).toBeUndefined()
  })
})
```

保存先: `tests/lib/board/attendance-status.test.ts`

- [ ] **Step 2: テストが失敗することを確認**

Run: `pnpm test attendance-status`
Expected: FAIL（モジュールが存在しない）

- [ ] **Step 3: 実装する**

```ts
export type AttendanceStatus = 'present' | 'absent'

export interface AttendanceEvent {
  action: 'clockIn' | 'clockOut'
  occurredAt: string
}

export interface AttendanceEventRecord extends AttendanceEvent {
  staffId: string
}

export function currentAttendanceStatus(events: AttendanceEvent[]): AttendanceStatus {
  if (events.length === 0) {
    return 'absent'
  }

  const latest = events.reduce((latestSoFar, current) =>
    new Date(current.occurredAt).getTime() > new Date(latestSoFar.occurredAt).getTime()
      ? current
      : latestSoFar,
  )

  return latest.action === 'clockIn' ? 'present' : 'absent'
}

export function attendanceStatusByStaff(
  events: AttendanceEventRecord[],
): Map<string, AttendanceStatus> {
  const eventsByStaff = new Map<string, AttendanceEventRecord[]>()

  for (const event of events) {
    const list = eventsByStaff.get(event.staffId) ?? []
    list.push(event)
    eventsByStaff.set(event.staffId, list)
  }

  const result = new Map<string, AttendanceStatus>()
  for (const [staffId, staffEvents] of eventsByStaff) {
    result.set(staffId, currentAttendanceStatus(staffEvents))
  }
  return result
}
```

保存先: `lib/board/attendance-status.ts`

- [ ] **Step 4: テストが通ることを確認**

Run: `pnpm test attendance-status`
Expected: PASS

- [ ] **Step 5: コミット**

```bash
git add lib/board/attendance-status.ts tests/lib/board/attendance-status.test.ts
git commit -m "$(cat <<'EOF'
出退勤ステータス判定(currentAttendanceStatus)を追加

attendance_eventsの最新イベントから出勤中/退勤中を判定する純粋関数。
イベントが1件も無い人は退勤中扱いにする。
EOF
)"
```

---

### Task 5: 車両分類（classifyVehicle）

車両1台を「使用中/空車/整備/車検/故障/使用停止」のいずれかに分類する純粋関数。legacyの`computeVehicleSummary`を移植する。DBのCHECK制約により`status`が既知の5値以外になることは無いため、legacyにあった「状態不明」の警告分岐は実装しない。

**Files:**
- Create: `lib/board/vehicle-category.ts`
- Test: `tests/lib/board/vehicle-category.test.ts`

**Interfaces:**
- Produces:
  - `type VehicleStatus = '使用可能' | '整備' | '車検' | '故障' | '使用停止'`
  - `type VehicleCategory = '使用中' | '空車' | '整備' | '車検' | '故障' | '使用停止'`
  - `classifyVehicle(params: { status: VehicleStatus; isDriven: boolean; isParkedAtSite: boolean }): VehicleCategory`
  - Task 9, 10で使用する。

- [ ] **Step 1: 失敗するテストを書く**

```ts
import { describe, expect, it } from 'vitest'
import { classifyVehicle } from '@/lib/board/vehicle-category'

describe('classifyVehicle', () => {
  it('使用可能かつ運転されていれば使用中', () => {
    expect(classifyVehicle({ status: '使用可能', isDriven: true, isParkedAtSite: false })).toBe('使用中')
  })

  it('使用可能かつ現場に無人駐車されていれば使用中', () => {
    expect(classifyVehicle({ status: '使用可能', isDriven: false, isParkedAtSite: true })).toBe('使用中')
  })

  it('使用可能で誰も乗らず駐車もされていなければ空車', () => {
    expect(classifyVehicle({ status: '使用可能', isDriven: false, isParkedAtSite: false })).toBe('空車')
  })

  it('使用可能以外はステータスそのものを返す(運転・駐車状況に関わらず)', () => {
    expect(classifyVehicle({ status: '車検', isDriven: false, isParkedAtSite: false })).toBe('車検')
    expect(classifyVehicle({ status: '故障', isDriven: true, isParkedAtSite: false })).toBe('故障')
  })
})
```

保存先: `tests/lib/board/vehicle-category.test.ts`

- [ ] **Step 2: テストが失敗することを確認**

Run: `pnpm test vehicle-category`
Expected: FAIL（モジュールが存在しない）

- [ ] **Step 3: 実装する**

```ts
export type VehicleStatus = '使用可能' | '整備' | '車検' | '故障' | '使用停止'
export type VehicleCategory = '使用中' | '空車' | '整備' | '車検' | '故障' | '使用停止'

export function classifyVehicle(params: {
  status: VehicleStatus
  isDriven: boolean
  isParkedAtSite: boolean
}): VehicleCategory {
  if (params.status !== '使用可能') {
    return params.status
  }
  return params.isDriven || params.isParkedAtSite ? '使用中' : '空車'
}
```

保存先: `lib/board/vehicle-category.ts`

- [ ] **Step 4: テストが通ることを確認**

Run: `pnpm test vehicle-category`
Expected: PASS

- [ ] **Step 5: コミット**

```bash
git add lib/board/vehicle-category.ts tests/lib/board/vehicle-category.test.ts
git commit -m "$(cat <<'EOF'
車両分類(classifyVehicle)を追加

車両1台を使用中/空車/整備/車検/故障/使用停止に分類する純粋関数。
statusのCHECK制約により状態不明になり得ないため、legacyにあった
警告分岐は実装しない。
EOF
)"
```

---

### Task 6: 配置枠一覧クエリ（getSiteGroupList）

指定部門の配置枠一覧（ID・ラベル）を軽量に取得する。実データ（人員・車両）はここでは取得しない。

**Files:**
- Create: `lib/queries/site-groups.ts`
- Test: `tests/lib/queries/site-groups.test.ts`

**Interfaces:**
- Consumes: `assignGroupLabels`, `RawSlot`（Task 3）、`createServerSupabaseClient`（既存 `lib/supabase/server.ts`）
- Produces: `interface SiteGroupSummary { slotId: string; label: string; department: '土木' | '運輸' }`、`getSiteGroupList(department: '土木' | '運輸'): Promise<SiteGroupSummary[]>`。Task 13（`SiteGroupList`）が使用する。

- [ ] **Step 1: 失敗するテストを書く**

```ts
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { createClient, type SupabaseClient } from '@supabase/supabase-js'
import type { Database } from '@/lib/supabase/database.types'
import { getSiteGroupList } from '@/lib/queries/site-groups'

describe('getSiteGroupList', () => {
  let adminClient: SupabaseClient<Database>
  let siteId: string
  let slotId1: string
  let slotId2: string

  beforeAll(async () => {
    const url = process.env.NEXT_PUBLIC_SUPABASE_URL as string
    const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY as string
    adminClient = createClient<Database>(url, serviceRoleKey)

    const { data: site, error: siteError } = await adminClient
      .from('sites')
      .insert({ name: 'TEST_getSiteGroupList現場', category: '運輸' })
      .select('id')
      .single()
    if (siteError || !site) throw new Error(`テスト用siteの作成に失敗しました: ${siteError?.message}`)
    siteId = site.id

    const { data: slot1, error: slot1Error } = await adminClient
      .from('placement_slots')
      .insert({ site_id: siteId, department: '運輸', opened_at: '2026-01-01T00:00:00Z' })
      .select('id')
      .single()
    if (slot1Error || !slot1) throw new Error(`テスト用配置枠1の作成に失敗しました: ${slot1Error?.message}`)
    slotId1 = slot1.id

    const { data: slot2, error: slot2Error } = await adminClient
      .from('placement_slots')
      .insert({ site_id: siteId, department: '運輸', opened_at: '2026-01-02T00:00:00Z' })
      .select('id')
      .single()
    if (slot2Error || !slot2) throw new Error(`テスト用配置枠2の作成に失敗しました: ${slot2Error?.message}`)
    slotId2 = slot2.id
  })

  afterAll(async () => {
    await adminClient.from('placement_slots').delete().in('id', [slotId1, slotId2])
    await adminClient.from('sites').delete().eq('id', siteId)
  })

  it('同じ現場の配置枠に開設順で丸数字ラベルを付けて返す', async () => {
    const groups = await getSiteGroupList('運輸')

    expect(groups.find((g) => g.slotId === slotId1)?.label).toBe('TEST_getSiteGroupList現場①')
    expect(groups.find((g) => g.slotId === slotId2)?.label).toBe('TEST_getSiteGroupList現場②')
  })

  it('部門が違う配置枠は含まれない', async () => {
    const groups = await getSiteGroupList('土木')
    expect(groups.find((g) => g.slotId === slotId1)).toBeUndefined()
  })
})
```

保存先: `tests/lib/queries/site-groups.test.ts`

- [ ] **Step 2: テストが失敗することを確認**

Run: `pnpm test site-groups`
Expected: FAIL（モジュールが存在しない）

- [ ] **Step 3: 実装する**

```ts
import { createServerSupabaseClient } from '@/lib/supabase/server'
import { assignGroupLabels, type RawSlot } from '@/lib/board/group-labels'

export interface SiteGroupSummary {
  slotId: string
  label: string
  department: '土木' | '運輸'
}

export async function getSiteGroupList(department: '土木' | '運輸'): Promise<SiteGroupSummary[]> {
  const supabase = createServerSupabaseClient()

  const { data, error } = await supabase
    .from('placement_slots')
    .select('id, site_id, opened_at, ended_at, department, sites(name)')
    .eq('department', department)
    .order('opened_at', { ascending: true })

  if (error) {
    throw new Error(`配置枠一覧の取得に失敗しました: ${error.message}`)
  }

  const rawSlots: RawSlot[] = (data ?? []).map((row) => ({
    slotId: row.id,
    siteId: row.site_id,
    siteName: row.sites?.name ?? '現場',
    department: row.department as '土木' | '運輸',
    openedAt: row.opened_at,
    endedAt: row.ended_at,
  }))

  return assignGroupLabels(rawSlots)
    .filter((slot) => slot.endedAt === null)
    .map(({ slotId, label, department: dept }) => ({ slotId, label, department: dept }))
}
```

保存先: `lib/queries/site-groups.ts`

- [ ] **Step 4: テストが通ることを確認**

Run: `pnpm test site-groups`
Expected: PASS

- [ ] **Step 5: コミット**

```bash
git add lib/queries/site-groups.ts tests/lib/queries/site-groups.test.ts
git commit -m "$(cat <<'EOF'
配置枠一覧クエリ(getSiteGroupList)を追加

指定部門の配置枠一覧をID・ラベルだけ軽量に取得する。実データは
各SiteGroupCardが個別に取得するため、ここでは含めない。
EOF
)"
```

---

### Task 7: 配置枠詳細クエリ（getSiteGroupDetail）

1つの配置枠に配置されている人員（出退勤状態・当日ダンプ込み）と、無人駐車中のダンプを取得する。3カラム表示の実データ本体。

**Files:**
- Create: `lib/queries/site-group-detail.ts`
- Test: `tests/lib/queries/site-group-detail.test.ts`

**Interfaces:**
- Consumes: `attendanceStatusByStaff`, `AttendanceStatus`（Task 4）
- Produces:

```ts
export interface SiteGroupDetail {
  staffMembers: Array<{
    staffId: string
    name: string
    attendanceStatus: AttendanceStatus
    vehicle: { vehicleId: string; displayName: string; vehicleNumber: string } | null
  }>
  parkedVehicles: Array<{ vehicleId: string; displayName: string; vehicleNumber: string }>
}
```

`getSiteGroupDetail(slotId: string): Promise<SiteGroupDetail>`。Task 13（`SiteGroupCard`）が使用する。

- [ ] **Step 1: 失敗するテストを書く**

```ts
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { createClient, type SupabaseClient } from '@supabase/supabase-js'
import type { Database } from '@/lib/supabase/database.types'
import { getSiteGroupDetail } from '@/lib/queries/site-group-detail'

describe('getSiteGroupDetail', () => {
  let adminClient: SupabaseClient<Database>
  let siteId: string
  let slotId: string
  let staffId: string
  let vehicleId: string
  let parkedVehicleId: string

  beforeAll(async () => {
    const url = process.env.NEXT_PUBLIC_SUPABASE_URL as string
    const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY as string
    adminClient = createClient<Database>(url, serviceRoleKey)

    const { data: site } = await adminClient
      .from('sites')
      .insert({ name: 'TEST_getSiteGroupDetail現場', category: '運輸' })
      .select('id')
      .single()
    siteId = site!.id

    const { data: slot } = await adminClient
      .from('placement_slots')
      .insert({ site_id: siteId, department: '運輸' })
      .select('id')
      .single()
    slotId = slot!.id

    const { data: vehicle } = await adminClient
      .from('vehicles')
      .insert({ display_name: 'TEST_運転中ダンプ', vehicle_number: '99', vehicle_type: '10t' })
      .select('id')
      .single()
    vehicleId = vehicle!.id

    const { data: parkedVehicle } = await adminClient
      .from('vehicles')
      .insert({ display_name: 'TEST_駐車中ダンプ', vehicle_number: '98', vehicle_type: '10t' })
      .select('id')
      .single()
    parkedVehicleId = parkedVehicle!.id

    const { data: staff } = await adminClient
      .from('staff')
      .insert({ name: 'TEST_getSiteGroupDetail運転手', department: '運輸' })
      .select('id')
      .single()
    staffId = staff!.id

    await adminClient
      .from('staff_placements')
      .insert({ staff_id: staffId, slot_id: slotId, assigned_vehicle_id: vehicleId })

    await adminClient.from('vehicle_placements').insert({ vehicle_id: parkedVehicleId, slot_id: slotId })

    await adminClient
      .from('attendance_events')
      .insert({ staff_id: staffId, action: 'clockIn', occurred_at: '2026-08-25T08:00:00Z' })
  })

  afterAll(async () => {
    await adminClient.from('attendance_events').delete().eq('staff_id', staffId)
    await adminClient.from('staff_placements').delete().eq('staff_id', staffId)
    await adminClient.from('vehicle_placements').delete().eq('vehicle_id', parkedVehicleId)
    await adminClient.from('staff').delete().eq('id', staffId)
    await adminClient.from('vehicles').delete().in('id', [vehicleId, parkedVehicleId])
    await adminClient.from('placement_slots').delete().eq('id', slotId)
    await adminClient.from('sites').delete().eq('id', siteId)
  })

  it('配置されている人員を出勤状態・乗車ダンプ込みで返す', async () => {
    const detail = await getSiteGroupDetail(slotId)

    const member = detail.staffMembers.find((m) => m.staffId === staffId)
    expect(member?.name).toBe('TEST_getSiteGroupDetail運転手')
    expect(member?.attendanceStatus).toBe('present')
    expect(member?.vehicle?.vehicleId).toBe(vehicleId)
  })

  it('無人駐車中のダンプをparkedVehiclesに返す', async () => {
    const detail = await getSiteGroupDetail(slotId)
    expect(detail.parkedVehicles.some((v) => v.vehicleId === parkedVehicleId)).toBe(true)
  })
})
```

保存先: `tests/lib/queries/site-group-detail.test.ts`

- [ ] **Step 2: テストが失敗することを確認**

Run: `pnpm test site-group-detail`
Expected: FAIL（モジュールが存在しない）

- [ ] **Step 3: 実装する**

```ts
import { createServerSupabaseClient } from '@/lib/supabase/server'
import { attendanceStatusByStaff, type AttendanceStatus } from '@/lib/board/attendance-status'

const NIL_UUID = '00000000-0000-0000-0000-000000000000'

export interface SiteGroupDetail {
  staffMembers: Array<{
    staffId: string
    name: string
    attendanceStatus: AttendanceStatus
    vehicle: { vehicleId: string; displayName: string; vehicleNumber: string } | null
  }>
  parkedVehicles: Array<{ vehicleId: string; displayName: string; vehicleNumber: string }>
}

export async function getSiteGroupDetail(slotId: string): Promise<SiteGroupDetail> {
  const supabase = createServerSupabaseClient()

  const { data: staffRows, error: staffError } = await supabase
    .from('staff_placements')
    .select('staff_id, staff(name), assigned_vehicle_id, vehicles:assigned_vehicle_id(id, display_name, vehicle_number)')
    .eq('slot_id', slotId)

  if (staffError) {
    throw new Error(`配置枠の人員取得に失敗しました: ${staffError.message}`)
  }

  const staffIds = (staffRows ?? []).map((row) => row.staff_id)

  const { data: eventRows, error: eventError } = await supabase
    .from('attendance_events')
    .select('staff_id, action, occurred_at')
    .in('staff_id', staffIds.length > 0 ? staffIds : [NIL_UUID])

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

  const { data: parkedRows, error: parkedError } = await supabase
    .from('vehicle_placements')
    .select('vehicle_id, vehicles(display_name, vehicle_number)')
    .eq('slot_id', slotId)

  if (parkedError) {
    throw new Error(`駐車車両の取得に失敗しました: ${parkedError.message}`)
  }

  return {
    staffMembers: (staffRows ?? []).map((row) => ({
      staffId: row.staff_id,
      name: row.staff?.name ?? '',
      attendanceStatus: statusByStaff.get(row.staff_id) ?? 'absent',
      vehicle: row.vehicles
        ? {
            vehicleId: row.vehicles.id,
            displayName: row.vehicles.display_name,
            vehicleNumber: row.vehicles.vehicle_number,
          }
        : null,
    })),
    parkedVehicles: (parkedRows ?? []).map((row) => ({
      vehicleId: row.vehicle_id,
      displayName: row.vehicles?.display_name ?? '',
      vehicleNumber: row.vehicles?.vehicle_number ?? '',
    })),
  }
}
```

保存先: `lib/queries/site-group-detail.ts`

- [ ] **Step 4: テストが通ることを確認**

Run: `pnpm test site-group-detail`
Expected: PASS

- [ ] **Step 5: コミット**

```bash
git add lib/queries/site-group-detail.ts tests/lib/queries/site-group-detail.test.ts
git commit -m "$(cat <<'EOF'
配置枠詳細クエリ(getSiteGroupDetail)を追加

配置枠1件分の人員(出退勤状態・当日ダンプ込み)と無人駐車中のダンプを
取得する。3カラム表示の実データ本体。
EOF
)"
```

---

### Task 8: 現場未定・休みクエリ（getUnassignedStaff）

配置枠を持たない(`slot_id is null`)人員を、出退勤状態でフィルタして取得する。**配置枠を持つ人はこの関数の対象外**（退勤しても配置枠に残るという不変条件を守るため、`slot_id`の有無だけで判定し、出退勤状態では配置枠所属者を動かさない）。

**Files:**
- Create: `lib/queries/unassigned-staff.ts`
- Test: `tests/lib/queries/unassigned-staff.test.ts`

**Interfaces:**
- Consumes: `attendanceStatusByStaff`, `AttendanceStatus`（Task 4）
- Produces: `interface UnassignedStaffMember { staffId: string; name: string }`、`getUnassignedStaff(department: '土木' | '運輸', presence: AttendanceStatus): Promise<UnassignedStaffMember[]>`。Task 14（`UnassignedStaffGroup` / `RestingStaffGroup`）が使用する。

- [ ] **Step 1: 失敗するテストを書く**

```ts
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { createClient, type SupabaseClient } from '@supabase/supabase-js'
import type { Database } from '@/lib/supabase/database.types'
import { getUnassignedStaff } from '@/lib/queries/unassigned-staff'

describe('getUnassignedStaff', () => {
  let adminClient: SupabaseClient<Database>
  let siteId: string
  let slotId: string
  let presentUnassignedId: string
  let absentUnassignedId: string
  let placedButClockedOutId: string

  beforeAll(async () => {
    const url = process.env.NEXT_PUBLIC_SUPABASE_URL as string
    const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY as string
    adminClient = createClient<Database>(url, serviceRoleKey)

    const { data: site } = await adminClient
      .from('sites')
      .insert({ name: 'TEST_getUnassignedStaff現場', category: '運輸' })
      .select('id')
      .single()
    siteId = site!.id

    const { data: slot } = await adminClient
      .from('placement_slots')
      .insert({ site_id: siteId, department: '運輸' })
      .select('id')
      .single()
    slotId = slot!.id

    const staffInputs = [
      { name: 'TEST_現場未定出勤中', department: '運輸' as const },
      { name: 'TEST_現場未定退勤中', department: '運輸' as const },
      { name: 'TEST_配置枠あり退勤中', department: '運輸' as const },
    ]
    const { data: staffRows } = await adminClient.from('staff').insert(staffInputs).select('id, name')
    presentUnassignedId = staffRows!.find((s) => s.name === 'TEST_現場未定出勤中')!.id
    absentUnassignedId = staffRows!.find((s) => s.name === 'TEST_現場未定退勤中')!.id
    placedButClockedOutId = staffRows!.find((s) => s.name === 'TEST_配置枠あり退勤中')!.id

    await adminClient.from('staff_placements').insert([
      { staff_id: placedButClockedOutId, slot_id: slotId },
    ])

    await adminClient.from('attendance_events').insert([
      { staff_id: presentUnassignedId, action: 'clockIn', occurred_at: '2026-08-25T08:00:00Z' },
      { staff_id: placedButClockedOutId, action: 'clockOut', occurred_at: '2026-08-25T17:00:00Z' },
    ])
  })

  afterAll(async () => {
    await adminClient
      .from('attendance_events')
      .delete()
      .in('staff_id', [presentUnassignedId, absentUnassignedId, placedButClockedOutId])
    await adminClient.from('staff_placements').delete().eq('staff_id', placedButClockedOutId)
    await adminClient
      .from('staff')
      .delete()
      .in('id', [presentUnassignedId, absentUnassignedId, placedButClockedOutId])
    await adminClient.from('placement_slots').delete().eq('id', slotId)
    await adminClient.from('sites').delete().eq('id', siteId)
  })

  it('配置枠が無く出勤中の人だけをpresentで返す', async () => {
    const result = await getUnassignedStaff('運輸', 'present')
    expect(result.some((s) => s.staffId === presentUnassignedId)).toBe(true)
    expect(result.some((s) => s.staffId === absentUnassignedId)).toBe(false)
  })

  it('配置枠が無く退勤中(イベント無し含む)の人だけをabsentで返す', async () => {
    const result = await getUnassignedStaff('運輸', 'absent')
    expect(result.some((s) => s.staffId === absentUnassignedId)).toBe(true)
  })

  it('配置枠を持つ人は退勤中でも対象に含まない(配置枠に残る不変条件)', async () => {
    const result = await getUnassignedStaff('運輸', 'absent')
    expect(result.some((s) => s.staffId === placedButClockedOutId)).toBe(false)
  })
})
```

保存先: `tests/lib/queries/unassigned-staff.test.ts`

- [ ] **Step 2: テストが失敗することを確認**

Run: `pnpm test unassigned-staff`
Expected: FAIL（モジュールが存在しない）

- [ ] **Step 3: 実装する**

```ts
import { createServerSupabaseClient } from '@/lib/supabase/server'
import { attendanceStatusByStaff, type AttendanceStatus } from '@/lib/board/attendance-status'

const NIL_UUID = '00000000-0000-0000-0000-000000000000'

export interface UnassignedStaffMember {
  staffId: string
  name: string
}

export async function getUnassignedStaff(
  department: '土木' | '運輸',
  presence: AttendanceStatus,
): Promise<UnassignedStaffMember[]> {
  const supabase = createServerSupabaseClient()

  const { data: staffRows, error: staffError } = await supabase
    .from('staff')
    .select('id, name, staff_placements(slot_id)')
    .eq('department', department)
    .eq('active', true)

  if (staffError) {
    throw new Error(`人員一覧の取得に失敗しました: ${staffError.message}`)
  }

  const unassigned = (staffRows ?? []).filter((row) => {
    const placement = Array.isArray(row.staff_placements)
      ? row.staff_placements[0]
      : row.staff_placements
    return !placement || placement.slot_id === null
  })

  const staffIds = unassigned.map((row) => row.id)

  const { data: eventRows, error: eventError } = await supabase
    .from('attendance_events')
    .select('staff_id, action, occurred_at')
    .in('staff_id', staffIds.length > 0 ? staffIds : [NIL_UUID])

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

  return unassigned
    .filter((row) => (statusByStaff.get(row.id) ?? 'absent') === presence)
    .map((row) => ({ staffId: row.id, name: row.name }))
}
```

保存先: `lib/queries/unassigned-staff.ts`

- [ ] **Step 4: テストが通ることを確認**

Run: `pnpm test unassigned-staff`
Expected: PASS

- [ ] **Step 5: コミット**

```bash
git add lib/queries/unassigned-staff.ts tests/lib/queries/unassigned-staff.test.ts
git commit -m "$(cat <<'EOF'
現場未定・休みクエリ(getUnassignedStaff)を追加

配置枠を持たない人員を出退勤状態でフィルタして取得する。配置枠を
持つ人は退勤しても配置枠に残るという不変条件を守るため、対象から
明確に除外している。
EOF
)"
```

---

### Task 9: 車両集計クエリ（getVehicleSummary）

運輸部門ヘッダーに出す車両20台の集計（使用中/空車/整備/車検/故障/使用停止/合計）を取得する。

**Files:**
- Create: `lib/queries/vehicle-summary.ts`
- Test: `tests/lib/queries/vehicle-summary.test.ts`

**Interfaces:**
- Consumes: `classifyVehicle`, `VehicleCategory`（Task 5）
- Produces: `interface VehicleSummary { counts: Record<VehicleCategory, number>; total: number }`、`getVehicleSummary(): Promise<VehicleSummary>`。Task 15（`VehicleSummaryBar`）が使用する。

- [ ] **Step 1: 失敗するテストを書く**

```ts
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { createClient, type SupabaseClient } from '@supabase/supabase-js'
import type { Database } from '@/lib/supabase/database.types'
import { getVehicleSummary } from '@/lib/queries/vehicle-summary'

describe('getVehicleSummary', () => {
  let adminClient: SupabaseClient<Database>
  let idleId: string
  let maintenanceId: string

  beforeAll(async () => {
    const url = process.env.NEXT_PUBLIC_SUPABASE_URL as string
    const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY as string
    adminClient = createClient<Database>(url, serviceRoleKey)

    const { data: vehicles } = await adminClient
      .from('vehicles')
      .insert([
        { display_name: 'TEST_空車ダンプ', vehicle_number: '81', vehicle_type: '10t', status: '使用可能' },
        { display_name: 'TEST_整備ダンプ', vehicle_number: '82', vehicle_type: '10t', status: '整備' },
      ])
      .select('id, display_name')
    idleId = vehicles!.find((v) => v.display_name === 'TEST_空車ダンプ')!.id
    maintenanceId = vehicles!.find((v) => v.display_name === 'TEST_整備ダンプ')!.id
  })

  afterAll(async () => {
    await adminClient.from('vehicles').delete().in('id', [idleId, maintenanceId])
  })

  it('使用可能で誰も使っていない車両を空車として数える', async () => {
    const summary = await getVehicleSummary()
    expect(summary.counts.空車).toBeGreaterThanOrEqual(1)
  })

  it('整備中の車両を整備として数え、合計に含める', async () => {
    const summary = await getVehicleSummary()
    expect(summary.counts.整備).toBeGreaterThanOrEqual(1)
    expect(summary.total).toBeGreaterThanOrEqual(2)
  })
})
```

保存先: `tests/lib/queries/vehicle-summary.test.ts`

- [ ] **Step 2: テストが失敗することを確認**

Run: `pnpm test vehicle-summary`
Expected: FAIL（モジュールが存在しない）

- [ ] **Step 3: 実装する**

```ts
import { createServerSupabaseClient } from '@/lib/supabase/server'
import { classifyVehicle, type VehicleCategory, type VehicleStatus } from '@/lib/board/vehicle-category'

export interface VehicleSummary {
  counts: Record<VehicleCategory, number>
  total: number
}

const EMPTY_COUNTS: Record<VehicleCategory, number> = {
  使用中: 0,
  空車: 0,
  整備: 0,
  車検: 0,
  故障: 0,
  使用停止: 0,
}

export async function getVehicleSummary(): Promise<VehicleSummary> {
  const supabase = createServerSupabaseClient()

  const { data: vehicles, error: vehicleError } = await supabase
    .from('vehicles')
    .select('id, status')
    .eq('active', true)

  if (vehicleError) {
    throw new Error(`車両一覧の取得に失敗しました: ${vehicleError.message}`)
  }

  const { data: drivenRows, error: drivenError } = await supabase
    .from('staff_placements')
    .select('assigned_vehicle_id')
    .not('assigned_vehicle_id', 'is', null)

  if (drivenError) {
    throw new Error(`運転中車両の取得に失敗しました: ${drivenError.message}`)
  }

  const { data: parkedRows, error: parkedError } = await supabase
    .from('vehicle_placements')
    .select('vehicle_id')
    .not('slot_id', 'is', null)

  if (parkedError) {
    throw new Error(`駐車車両の取得に失敗しました: ${parkedError.message}`)
  }

  const drivenIds = new Set((drivenRows ?? []).map((row) => row.assigned_vehicle_id as string))
  const parkedIds = new Set((parkedRows ?? []).map((row) => row.vehicle_id))

  const counts = { ...EMPTY_COUNTS }
  for (const vehicle of vehicles ?? []) {
    const category = classifyVehicle({
      status: vehicle.status as VehicleStatus,
      isDriven: drivenIds.has(vehicle.id),
      isParkedAtSite: parkedIds.has(vehicle.id),
    })
    counts[category] += 1
  }

  return { counts, total: (vehicles ?? []).length }
}
```

保存先: `lib/queries/vehicle-summary.ts`

- [ ] **Step 4: テストが通ることを確認**

Run: `pnpm test vehicle-summary`
Expected: PASS

- [ ] **Step 5: コミット**

```bash
git add lib/queries/vehicle-summary.ts tests/lib/queries/vehicle-summary.test.ts
git commit -m "$(cat <<'EOF'
車両集計クエリ(getVehicleSummary)を追加

運輸部門ヘッダーの車両20台の集計(使用中/空車/整備/車検/故障/使用停止/
合計)を取得する。
EOF
)"
```

---

### Task 10: 空車・状態別車両クエリ（getIdleVehicles / getVehiclesByStatus）

運輸部門の特殊グループ「空車」「整備」「車検」「故障」「使用停止」に表示する車両一覧を取得する。

**Files:**
- Create: `lib/queries/vehicle-groups.ts`
- Test: `tests/lib/queries/vehicle-groups.test.ts`

**Interfaces:**
- Consumes: `classifyVehicle`（Task 5）
- Produces: `interface VehicleGroupItem { vehicleId: string; displayName: string; vehicleNumber: string }`、`getIdleVehicles(): Promise<VehicleGroupItem[]>`、`getVehiclesByStatus(status: '整備' | '車検' | '故障' | '使用停止'): Promise<VehicleGroupItem[]>`。Task 15が使用する。

- [ ] **Step 1: 失敗するテストを書く**

```ts
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { createClient, type SupabaseClient } from '@supabase/supabase-js'
import type { Database } from '@/lib/supabase/database.types'
import { getIdleVehicles, getVehiclesByStatus } from '@/lib/queries/vehicle-groups'

describe('vehicle-groups', () => {
  let adminClient: SupabaseClient<Database>
  let idleId: string
  let brokenId: string

  beforeAll(async () => {
    const url = process.env.NEXT_PUBLIC_SUPABASE_URL as string
    const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY as string
    adminClient = createClient<Database>(url, serviceRoleKey)

    const { data: vehicles } = await adminClient
      .from('vehicles')
      .insert([
        { display_name: 'TEST_空車グループ用', vehicle_number: '71', vehicle_type: '10t', status: '使用可能' },
        { display_name: 'TEST_故障グループ用', vehicle_number: '72', vehicle_type: '10t', status: '故障' },
      ])
      .select('id, display_name')
    idleId = vehicles!.find((v) => v.display_name === 'TEST_空車グループ用')!.id
    brokenId = vehicles!.find((v) => v.display_name === 'TEST_故障グループ用')!.id
  })

  afterAll(async () => {
    await adminClient.from('vehicles').delete().in('id', [idleId, brokenId])
  })

  it('getIdleVehiclesは使用可能で誰も使っていない車両を返す', async () => {
    const vehicles = await getIdleVehicles()
    expect(vehicles.some((v) => v.vehicleId === idleId)).toBe(true)
    expect(vehicles.some((v) => v.vehicleId === brokenId)).toBe(false)
  })

  it('getVehiclesByStatusは指定ステータスの車両だけを返す', async () => {
    const vehicles = await getVehiclesByStatus('故障')
    expect(vehicles.some((v) => v.vehicleId === brokenId)).toBe(true)
    expect(vehicles.some((v) => v.vehicleId === idleId)).toBe(false)
  })
})
```

保存先: `tests/lib/queries/vehicle-groups.test.ts`

- [ ] **Step 2: テストが失敗することを確認**

Run: `pnpm test vehicle-groups`
Expected: FAIL（モジュールが存在しない）

- [ ] **Step 3: 実装する**

```ts
import { createServerSupabaseClient } from '@/lib/supabase/server'
import { classifyVehicle } from '@/lib/board/vehicle-category'

export interface VehicleGroupItem {
  vehicleId: string
  displayName: string
  vehicleNumber: string
}

export async function getIdleVehicles(): Promise<VehicleGroupItem[]> {
  const supabase = createServerSupabaseClient()

  const { data: vehicles, error: vehicleError } = await supabase
    .from('vehicles')
    .select('id, display_name, vehicle_number')
    .eq('active', true)
    .eq('status', '使用可能')

  if (vehicleError) {
    throw new Error(`車両一覧の取得に失敗しました: ${vehicleError.message}`)
  }

  const { data: drivenRows, error: drivenError } = await supabase
    .from('staff_placements')
    .select('assigned_vehicle_id')
    .not('assigned_vehicle_id', 'is', null)

  if (drivenError) {
    throw new Error(`運転中車両の取得に失敗しました: ${drivenError.message}`)
  }

  const { data: parkedRows, error: parkedError } = await supabase
    .from('vehicle_placements')
    .select('vehicle_id')
    .not('slot_id', 'is', null)

  if (parkedError) {
    throw new Error(`駐車車両の取得に失敗しました: ${parkedError.message}`)
  }

  const drivenIds = new Set((drivenRows ?? []).map((row) => row.assigned_vehicle_id as string))
  const parkedIds = new Set((parkedRows ?? []).map((row) => row.vehicle_id))

  return (vehicles ?? [])
    .filter(
      (v) =>
        classifyVehicle({ status: '使用可能', isDriven: drivenIds.has(v.id), isParkedAtSite: parkedIds.has(v.id) }) ===
        '空車',
    )
    .map((v) => ({ vehicleId: v.id, displayName: v.display_name, vehicleNumber: v.vehicle_number }))
}

export async function getVehiclesByStatus(
  status: '整備' | '車検' | '故障' | '使用停止',
): Promise<VehicleGroupItem[]> {
  const supabase = createServerSupabaseClient()

  const { data, error } = await supabase
    .from('vehicles')
    .select('id, display_name, vehicle_number')
    .eq('active', true)
    .eq('status', status)

  if (error) {
    throw new Error(`車両一覧の取得に失敗しました: ${error.message}`)
  }

  return (data ?? []).map((v) => ({
    vehicleId: v.id,
    displayName: v.display_name,
    vehicleNumber: v.vehicle_number,
  }))
}
```

保存先: `lib/queries/vehicle-groups.ts`

- [ ] **Step 4: テストが通ることを確認**

Run: `pnpm test vehicle-groups`
Expected: PASS

- [ ] **Step 5: コミット**

```bash
git add lib/queries/vehicle-groups.ts tests/lib/queries/vehicle-groups.test.ts
git commit -m "$(cat <<'EOF'
空車・状態別車両クエリを追加

運輸部門の特殊グループ(空車/整備/車検/故障/使用停止)に表示する
車両一覧を取得するgetIdleVehicles/getVehiclesByStatusを追加。
EOF
)"
```

---

### Task 11: 名札コンポーネント（VerticalText / NameTag / SiteTag / VehicleTag）

縦書き表示の共通ラッパーと、運転手札・現場名札・ダンプ札のUIコンポーネント。まだテストデータを取得するロジックとは繋がず、単体で見た目を作る。

**Files:**
- Create: `components/ui/vertical-text.tsx`
- Create: `components/ui/name-tag.tsx`
- Create: `components/ui/site-tag.tsx`
- Create: `components/ui/vehicle-tag.tsx`

**Interfaces:**
- Consumes: `AttendanceStatus`（Task 4）
- Produces: `<VerticalText text />`, `<NameTag name status />`, `<SiteTag name />`, `<VehicleTag displayName vehicleNumber />`。Task 13, 14, 15が使用する。

この4コンポーネントは純粋な表示コンポーネントで、DBにもRealtimeにも依存しないため個別のVitestテストは書かない（見た目の確認はTask 19のブラウザ目視確認で行う）。

- [ ] **Step 1: VerticalTextを実装する**

```tsx
export function VerticalText({ text, className = '' }: { text: string; className?: string }) {
  return (
    <span
      className={`inline-block [writing-mode:vertical-rl] [text-combine-upright:digits_2] ${className}`}
    >
      {text}
    </span>
  )
}
```

保存先: `components/ui/vertical-text.tsx`

- [ ] **Step 2: NameTagを実装する**

```tsx
import { VerticalText } from './vertical-text'
import type { AttendanceStatus } from '@/lib/board/attendance-status'

export function NameTag({ name, status }: { name: string; status: AttendanceStatus }) {
  const colorClass =
    status === 'present'
      ? 'bg-white text-black border-black'
      : 'bg-red-600 text-white border-red-800'

  return (
    <div className={`flex h-32 w-10 items-center justify-center rounded border-2 ${colorClass}`}>
      <VerticalText text={name} />
    </div>
  )
}
```

保存先: `components/ui/name-tag.tsx`

- [ ] **Step 3: SiteTagを実装する**

```tsx
import { VerticalText } from './vertical-text'

export function SiteTag({ name }: { name: string }) {
  return (
    <div className="flex h-32 w-12 items-center justify-center rounded border-2 border-amber-900 bg-amber-100 text-amber-950">
      <VerticalText text={name} />
    </div>
  )
}
```

保存先: `components/ui/site-tag.tsx`

- [ ] **Step 4: VehicleTagを実装する**

```tsx
import { VerticalText } from './vertical-text'

export function VehicleTag({
  displayName,
  vehicleNumber,
}: {
  displayName: string
  vehicleNumber: string
}) {
  return (
    <div className="flex h-32 w-10 items-center justify-center rounded border-2 border-slate-700 bg-slate-100 text-slate-900">
      <VerticalText text={`${displayName}${vehicleNumber}`} />
    </div>
  )
}
```

保存先: `components/ui/vehicle-tag.tsx`

- [ ] **Step 5: 型チェックを実行**

Run: `npx tsc --noEmit`
Expected: エラー無し

- [ ] **Step 6: コミット**

```bash
git add components/ui/vertical-text.tsx components/ui/name-tag.tsx components/ui/site-tag.tsx components/ui/vehicle-tag.tsx
git commit -m "$(cat <<'EOF'
名札コンポーネント(VerticalText/NameTag/SiteTag/VehicleTag)を追加

writing-mode:vertical-rlとtext-combine-upright:digits 2による縦書き
表示の共通ラッパーと、運転手札・現場名札・ダンプ札を実装した。
EOF
)"
```

---

### Task 12: 折りたたみコンポーネント（CollapsibleBoard / CollapsibleSection）

行ごとの開閉と、部門ごとの「すべて開く/すべて閉じる」を実現するクライアントコンポーネント。個々のセクションがどんなIDを持つか事前に知らなくても動くよう、開閉は「シグナル発火→各セクションが自分で反応する」方式にする。

**Files:**
- Create: `components/board/collapsible-board.tsx`
- Create: `components/board/collapsible-section.tsx`

**Interfaces:**
- Produces: `<CollapsibleBoard>{children}</CollapsibleBoard>`, `<CollapsibleSection title>{children}</CollapsibleSection>`, `useCollapsibleBoardSignal(): { openSignal: number; closeSignal: number }`。Task 13, 14, 15, 16が使用する。

- [ ] **Step 1: CollapsibleBoardを実装する**

```tsx
'use client'

import { createContext, useContext, useState, type ReactNode } from 'react'

interface CollapsibleBoardContextValue {
  openSignal: number
  closeSignal: number
}

const CollapsibleBoardContext = createContext<CollapsibleBoardContextValue>({
  openSignal: 0,
  closeSignal: 0,
})

export function useCollapsibleBoardSignal(): CollapsibleBoardContextValue {
  return useContext(CollapsibleBoardContext)
}

export function CollapsibleBoard({ children }: { children: ReactNode }) {
  const [openSignal, setOpenSignal] = useState(0)
  const [closeSignal, setCloseSignal] = useState(0)

  return (
    <CollapsibleBoardContext.Provider value={{ openSignal, closeSignal }}>
      <div className="flex flex-col gap-2">
        <div className="flex justify-end gap-2">
          <button
            type="button"
            className="rounded bg-slate-200 px-3 py-1 text-sm"
            onClick={() => setOpenSignal((n) => n + 1)}
          >
            すべて開く
          </button>
          <button
            type="button"
            className="rounded bg-slate-200 px-3 py-1 text-sm"
            onClick={() => setCloseSignal((n) => n + 1)}
          >
            すべて閉じる
          </button>
        </div>
        {children}
      </div>
    </CollapsibleBoardContext.Provider>
  )
}
```

保存先: `components/board/collapsible-board.tsx`

- [ ] **Step 2: CollapsibleSectionを実装する**

```tsx
'use client'

import { useEffect, useRef, useState, type ReactNode } from 'react'
import { useCollapsibleBoardSignal } from './collapsible-board'

export function CollapsibleSection({ title, children }: { title: string; children: ReactNode }) {
  const { openSignal, closeSignal } = useCollapsibleBoardSignal()
  const [isOpen, setIsOpen] = useState(true)
  const openMounted = useRef(false)
  const closeMounted = useRef(false)

  useEffect(() => {
    if (!openMounted.current) {
      openMounted.current = true
      return
    }
    setIsOpen(true)
  }, [openSignal])

  useEffect(() => {
    if (!closeMounted.current) {
      closeMounted.current = true
      return
    }
    setIsOpen(false)
  }, [closeSignal])

  return (
    <section>
      <button
        type="button"
        className="w-full text-left font-bold"
        onClick={() => setIsOpen((prev) => !prev)}
      >
        {isOpen ? '▼' : '▶'} {title}
      </button>
      {isOpen ? <div>{children}</div> : null}
    </section>
  )
}
```

保存先: `components/board/collapsible-section.tsx`

- [ ] **Step 3: 型チェックを実行**

Run: `npx tsc --noEmit`
Expected: エラー無し

- [ ] **Step 4: コミット**

```bash
git add components/board/collapsible-board.tsx components/board/collapsible-section.tsx
git commit -m "$(cat <<'EOF'
折りたたみコンポーネント(CollapsibleBoard/CollapsibleSection)を追加

行ごとの開閉と部門ごとの「すべて開く/すべて閉じる」を実装。開閉は
シグナル発火方式にし、各セクションが自分のIDを親に登録しなくても
動くようにした。開閉状態は保存しない(再読み込みで全展開に戻る)。
EOF
)"
```

---

### Task 13: 配置枠カード（SiteGroupCard / SiteGroupList）

配置枠一覧から各カードをストリーミング描画する。各カードは自分の`slotId`で個別にデータを取得する。

**Files:**
- Create: `components/board/site-group-card.tsx`
- Create: `components/board/site-group-list.tsx`

**Interfaces:**
- Consumes: `getSiteGroupList`（Task 6）, `getSiteGroupDetail`（Task 7）, `CollapsibleSection`（Task 12）, `NameTag` / `SiteTag` / `VehicleTag`（Task 11）
- Produces: `<SiteGroupList department />`（Task 16の`DepartmentBoard`が使用）

- [ ] **Step 1: SiteGroupCardを実装する**

```tsx
import { getSiteGroupDetail } from '@/lib/queries/site-group-detail'
import { CollapsibleSection } from './collapsible-section'
import { NameTag } from '@/components/ui/name-tag'
import { SiteTag } from '@/components/ui/site-tag'
import { VehicleTag } from '@/components/ui/vehicle-tag'

export async function SiteGroupCard({
  slotId,
  label,
  department,
}: {
  slotId: string
  label: string
  department: '土木' | '運輸'
}) {
  const detail = await getSiteGroupDetail(slotId)
  const drivenVehicles = detail.staffMembers.filter((m) => m.vehicle)
  const vehicleCount = drivenVehicles.length + detail.parkedVehicles.length
  const title =
    department === '運輸'
      ? `${label}（${detail.staffMembers.length}人/${vehicleCount}台）`
      : `${label}（${detail.staffMembers.length}人）`

  return (
    <CollapsibleSection title={title}>
      <div className="flex flex-wrap items-start gap-4">
        <div className="flex flex-wrap gap-2">
          {detail.staffMembers.map((member) => (
            <NameTag key={member.staffId} name={member.name} status={member.attendanceStatus} />
          ))}
        </div>
        <SiteTag name={label} />
        {department === '運輸' ? (
          <div className="flex flex-wrap gap-2">
            {drivenVehicles.map((member) => (
              <VehicleTag
                key={member.vehicle!.vehicleId}
                displayName={member.vehicle!.displayName}
                vehicleNumber={member.vehicle!.vehicleNumber}
              />
            ))}
            {detail.parkedVehicles.map((vehicle) => (
              <VehicleTag
                key={vehicle.vehicleId}
                displayName={vehicle.displayName}
                vehicleNumber={vehicle.vehicleNumber}
              />
            ))}
          </div>
        ) : null}
      </div>
    </CollapsibleSection>
  )
}
```

保存先: `components/board/site-group-card.tsx`

- [ ] **Step 2: SiteGroupListを実装する**

```tsx
import { Suspense } from 'react'
import { getSiteGroupList } from '@/lib/queries/site-groups'
import { SiteGroupCard } from './site-group-card'

export async function SiteGroupList({ department }: { department: '土木' | '運輸' }) {
  const groups = await getSiteGroupList(department)

  return (
    <>
      {groups.map((group) => (
        <Suspense key={group.slotId} fallback={<p>{group.label}を読み込み中...</p>}>
          <SiteGroupCard slotId={group.slotId} label={group.label} department={department} />
        </Suspense>
      ))}
    </>
  )
}
```

保存先: `components/board/site-group-list.tsx`

- [ ] **Step 3: 型チェックを実行**

Run: `npx tsc --noEmit`
Expected: エラー無し

- [ ] **Step 4: コミット**

```bash
git add components/board/site-group-card.tsx components/board/site-group-list.tsx
git commit -m "$(cat <<'EOF'
配置枠カード(SiteGroupCard/SiteGroupList)を追加

配置枠一覧はIDとラベルだけ軽量取得し、各カードが自分のslotIdで
個別にデータ取得・ストリーミング描画する。
EOF
)"
```

---

### Task 14: 特殊グループコンポーネント（UnassignedStaffGroup / RestingStaffGroup）

現場未定・休みグループ。該当者がいないときは何も描画しない。

**Files:**
- Create: `components/board/unassigned-staff-group.tsx`
- Create: `components/board/resting-staff-group.tsx`

**Interfaces:**
- Consumes: `getUnassignedStaff`（Task 8）, `CollapsibleSection`（Task 12）, `NameTag` / `SiteTag`（Task 11）
- Produces: `<UnassignedStaffGroup department />`, `<RestingStaffGroup department />`（Task 16が使用）

- [ ] **Step 1: UnassignedStaffGroupを実装する**

```tsx
import { getUnassignedStaff } from '@/lib/queries/unassigned-staff'
import { CollapsibleSection } from './collapsible-section'
import { NameTag } from '@/components/ui/name-tag'
import { SiteTag } from '@/components/ui/site-tag'

export async function UnassignedStaffGroup({ department }: { department: '土木' | '運輸' }) {
  const members = await getUnassignedStaff(department, 'present')
  if (members.length === 0) {
    return null
  }

  return (
    <CollapsibleSection title={`現場未定（${members.length}人）`}>
      <div className="flex flex-wrap items-start gap-4">
        <div className="flex flex-wrap gap-2">
          {members.map((member) => (
            <NameTag key={member.staffId} name={member.name} status="present" />
          ))}
        </div>
        <SiteTag name="現場未定" />
      </div>
    </CollapsibleSection>
  )
}
```

保存先: `components/board/unassigned-staff-group.tsx`

- [ ] **Step 2: RestingStaffGroupを実装する**

```tsx
import { getUnassignedStaff } from '@/lib/queries/unassigned-staff'
import { CollapsibleSection } from './collapsible-section'
import { NameTag } from '@/components/ui/name-tag'
import { SiteTag } from '@/components/ui/site-tag'

export async function RestingStaffGroup({ department }: { department: '土木' | '運輸' }) {
  const members = await getUnassignedStaff(department, 'absent')
  if (members.length === 0) {
    return null
  }

  return (
    <CollapsibleSection title={`休み（${members.length}人）`}>
      <div className="flex flex-wrap items-start gap-4">
        <div className="flex flex-wrap gap-2">
          {members.map((member) => (
            <NameTag key={member.staffId} name={member.name} status="absent" />
          ))}
        </div>
        <SiteTag name="休み" />
      </div>
    </CollapsibleSection>
  )
}
```

保存先: `components/board/resting-staff-group.tsx`

- [ ] **Step 3: 型チェックを実行**

Run: `npx tsc --noEmit`
Expected: エラー無し

- [ ] **Step 4: コミット**

```bash
git add components/board/unassigned-staff-group.tsx components/board/resting-staff-group.tsx
git commit -m "$(cat <<'EOF'
現場未定・休みグループコンポーネントを追加

該当者がいないときは何も描画しない(READMEの「該当者がいるときのみ
表示」仕様どおり)。
EOF
)"
```

---

### Task 15: 運輸部門の車両集計・状態グループ

車両20台の集計バーと、空車・整備・車検・故障・使用停止の各グループ。

**Files:**
- Create: `components/board/vehicle-summary-bar.tsx`
- Create: `components/board/idle-vehicle-group.tsx`
- Create: `components/board/vehicle-status-group.tsx`

**Interfaces:**
- Consumes: `getVehicleSummary`（Task 9）, `getIdleVehicles` / `getVehiclesByStatus`（Task 10）, `CollapsibleSection`（Task 12）, `SiteTag` / `VehicleTag`（Task 11）
- Produces: `<VehicleSummaryBar />`, `<IdleVehicleGroup />`, `<VehicleStatusGroup status />`（Task 16が使用）

- [ ] **Step 1: VehicleSummaryBarを実装する**

```tsx
import { getVehicleSummary } from '@/lib/queries/vehicle-summary'

export async function VehicleSummaryBar() {
  const summary = await getVehicleSummary()
  const c = summary.counts

  return (
    <p className="text-sm">
      車両: 使用中{c.使用中}台 / 空車{c.空車}台 / 整備{c.整備}台 / 車検{c.車検}台 / 故障{c.故障}台 /
      使用停止{c.使用停止}台（合計{summary.total}台）
    </p>
  )
}
```

保存先: `components/board/vehicle-summary-bar.tsx`

- [ ] **Step 2: IdleVehicleGroupを実装する**

```tsx
import { getIdleVehicles } from '@/lib/queries/vehicle-groups'
import { CollapsibleSection } from './collapsible-section'
import { SiteTag } from '@/components/ui/site-tag'
import { VehicleTag } from '@/components/ui/vehicle-tag'

export async function IdleVehicleGroup() {
  const vehicles = await getIdleVehicles()
  if (vehicles.length === 0) {
    return null
  }

  return (
    <CollapsibleSection title={`空車（${vehicles.length}台）`}>
      <div className="flex flex-wrap items-start gap-4">
        <SiteTag name="空車" />
        <div className="flex flex-wrap gap-2">
          {vehicles.map((vehicle) => (
            <VehicleTag
              key={vehicle.vehicleId}
              displayName={vehicle.displayName}
              vehicleNumber={vehicle.vehicleNumber}
            />
          ))}
        </div>
      </div>
    </CollapsibleSection>
  )
}
```

保存先: `components/board/idle-vehicle-group.tsx`

- [ ] **Step 3: VehicleStatusGroupを実装する**

```tsx
import { getVehiclesByStatus } from '@/lib/queries/vehicle-groups'
import { CollapsibleSection } from './collapsible-section'
import { SiteTag } from '@/components/ui/site-tag'
import { VehicleTag } from '@/components/ui/vehicle-tag'

export async function VehicleStatusGroup({
  status,
}: {
  status: '整備' | '車検' | '故障' | '使用停止'
}) {
  const vehicles = await getVehiclesByStatus(status)
  if (vehicles.length === 0) {
    return null
  }

  return (
    <CollapsibleSection title={`${status}（${vehicles.length}台）`}>
      <div className="flex flex-wrap items-start gap-4">
        <SiteTag name={status} />
        <div className="flex flex-wrap gap-2">
          {vehicles.map((vehicle) => (
            <VehicleTag
              key={vehicle.vehicleId}
              displayName={vehicle.displayName}
              vehicleNumber={vehicle.vehicleNumber}
            />
          ))}
        </div>
      </div>
    </CollapsibleSection>
  )
}
```

保存先: `components/board/vehicle-status-group.tsx`

- [ ] **Step 4: 型チェックを実行**

Run: `npx tsc --noEmit`
Expected: エラー無し

- [ ] **Step 5: コミット**

```bash
git add components/board/vehicle-summary-bar.tsx components/board/idle-vehicle-group.tsx components/board/vehicle-status-group.tsx
git commit -m "$(cat <<'EOF'
運輸部門の車両集計・状態別グループコンポーネントを追加

車両20台の集計バーと、空車/整備/車検/故障/使用停止の各特殊グループを
実装した。
EOF
)"
```

---

### Task 16: 部門盤面と時計ヘッダーの統合

各コンポーネントをSuspense境界付きで組み立て、`app/page.tsx`を盤面画面にする。

**Files:**
- Create: `components/board/department-board.tsx`
- Create: `components/board/clock-header.tsx`
- Modify: `app/page.tsx`（既存の`StaffCount`表示を置き換える）

**Interfaces:**
- Consumes: Task 12〜15の全コンポーネント
- Produces: `<DepartmentBoard department />`, `<ClockHeader />`

- [ ] **Step 1: DepartmentBoardを実装する**

```tsx
import { Suspense } from 'react'
import { CollapsibleBoard } from './collapsible-board'
import { SiteGroupList } from './site-group-list'
import { UnassignedStaffGroup } from './unassigned-staff-group'
import { RestingStaffGroup } from './resting-staff-group'
import { VehicleSummaryBar } from './vehicle-summary-bar'
import { IdleVehicleGroup } from './idle-vehicle-group'
import { VehicleStatusGroup } from './vehicle-status-group'

const VEHICLE_STATUSES = ['整備', '車検', '故障', '使用停止'] as const

export function DepartmentBoard({ department }: { department: '土木' | '運輸' }) {
  return (
    <section className="flex flex-col gap-4">
      <h2 className="text-2xl font-bold">{department}部門</h2>

      {department === '運輸' ? (
        <Suspense fallback={<p>車両集計を読み込み中...</p>}>
          <VehicleSummaryBar />
        </Suspense>
      ) : null}

      <CollapsibleBoard>
        <Suspense fallback={<p>配置枠を読み込み中...</p>}>
          <SiteGroupList department={department} />
        </Suspense>

        <Suspense fallback={<p>現場未定を読み込み中...</p>}>
          <UnassignedStaffGroup department={department} />
        </Suspense>

        {department === '運輸' ? (
          <>
            <Suspense fallback={<p>空車を読み込み中...</p>}>
              <IdleVehicleGroup />
            </Suspense>
            {VEHICLE_STATUSES.map((status) => (
              <Suspense key={status} fallback={<p>{status}を読み込み中...</p>}>
                <VehicleStatusGroup status={status} />
              </Suspense>
            ))}
          </>
        ) : null}

        <Suspense fallback={<p>休みを読み込み中...</p>}>
          <RestingStaffGroup department={department} />
        </Suspense>
      </CollapsibleBoard>
    </section>
  )
}
```

保存先: `components/board/department-board.tsx`

- [ ] **Step 2: ClockHeaderを実装する**

```tsx
'use client'

import { useEffect, useState } from 'react'

function formatClock(date: Date): { time: string; dateLabel: string } {
  const time = date.toLocaleTimeString('ja-JP', { hour12: false })
  const dateLabel = date.toLocaleDateString('ja-JP', {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
    weekday: 'short',
  })
  return { time, dateLabel }
}

export function ClockHeader() {
  const [now, setNow] = useState<Date | null>(null)

  useEffect(() => {
    setNow(new Date())
    const timer = setInterval(() => setNow(new Date()), 1000)
    return () => clearInterval(timer)
  }, [])

  if (!now) {
    return null
  }

  const { time, dateLabel } = formatClock(now)

  return (
    <header className="flex flex-col items-center py-4">
      <p className="font-mono text-5xl tabular-nums">{time}</p>
      <p className="text-lg">{dateLabel}</p>
    </header>
  )
}
```

保存先: `components/board/clock-header.tsx`（サーバー・クライアントで初回描画の時刻がずれてハイドレーションエラーになるのを避けるため、`now`の初期値は`null`にしてマウント後に`useEffect`で設定する）

- [ ] **Step 3: app/page.tsxを差し替える**

```tsx
import { ClockHeader } from '@/components/board/clock-header'
import { DepartmentBoard } from '@/components/board/department-board'

export default function BoardPage() {
  return (
    <main className="flex flex-col gap-8 p-4">
      <ClockHeader />
      <DepartmentBoard department="土木" />
      <DepartmentBoard department="運輸" />
    </main>
  )
}
```

保存先: `app/page.tsx`（`RealtimeBoardWatcher`はTask 17で追加する）

- [ ] **Step 4: ビルドで確認**

Run: `pnpm build`
Expected: ビルドが成功する（型エラー・構文エラーが無い）

- [ ] **Step 5: コミット**

```bash
git add components/board/department-board.tsx components/board/clock-header.tsx app/page.tsx
git commit -m "$(cat <<'EOF'
部門盤面と時計ヘッダーを統合し、盤面画面を組み立てる

DepartmentBoard/ClockHeaderを追加し、app/page.tsxを疎通確認用の
StaffCount表示から実際の配車・出退勤ボードに置き換えた。
EOF
)"
```

---

### Task 17: Realtime自動同期（RealtimeBoardWatcher）

複数端末で同じ盤面を見るための自動同期。関連テーブルの変更を購読し、検知したら`router.refresh()`でサーバー側の再フェッチを起こす。

**Files:**
- Create: `components/board/realtime-board-watcher.tsx`
- Modify: `app/page.tsx`

**Interfaces:**
- Produces: `<RealtimeBoardWatcher />`（何も描画しない）

- [ ] **Step 1: RealtimeBoardWatcherを実装する**

```tsx
'use client'

import { useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@supabase/supabase-js'
import type { Database } from '@/lib/supabase/database.types'

const WATCHED_TABLES = [
  'staff',
  'vehicles',
  'sites',
  'placement_slots',
  'staff_placements',
  'vehicle_placements',
  'attendance_events',
] as const

export function RealtimeBoardWatcher() {
  const router = useRouter()

  useEffect(() => {
    const supabase = createClient<Database>(
      process.env.NEXT_PUBLIC_SUPABASE_URL as string,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY as string,
    )

    const channel = supabase.channel('board-realtime')
    for (const table of WATCHED_TABLES) {
      channel.on(
        'postgres_changes',
        { event: '*', schema: 'public', table },
        () => {
          router.refresh()
        },
      )
    }
    channel.subscribe()

    return () => {
      supabase.removeChannel(channel)
    }
  }, [router])

  return null
}
```

保存先: `components/board/realtime-board-watcher.tsx`

- [ ] **Step 2: app/page.tsxに組み込む**

```tsx
import { ClockHeader } from '@/components/board/clock-header'
import { RealtimeBoardWatcher } from '@/components/board/realtime-board-watcher'
import { DepartmentBoard } from '@/components/board/department-board'

export default function BoardPage() {
  return (
    <main className="flex flex-col gap-8 p-4">
      <ClockHeader />
      <RealtimeBoardWatcher />
      <DepartmentBoard department="土木" />
      <DepartmentBoard department="運輸" />
    </main>
  )
}
```

保存先: `app/page.tsx`

- [ ] **Step 3: Supabaseダッシュボードで対象テーブルのRealtime配信を有効化**

Supabaseダッシュボード → Database → Replication で、`WATCHED_TABLES`の7テーブルすべてに対して Realtime を有効化する（デフォルトでは無効なテーブルがあるため、手動確認が必須）。

- [ ] **Step 4: ビルドで確認**

Run: `pnpm build`
Expected: ビルドが成功する

- [ ] **Step 5: コミット**

```bash
git add components/board/realtime-board-watcher.tsx app/page.tsx
git commit -m "$(cat <<'EOF'
Realtime自動同期(RealtimeBoardWatcher)を追加

盤面に関わる7テーブルのpostgres_changesを購読し、変更検知の
たびにrouter.refresh()でサーバー側を再フェッチする。複雑な
クライアント状態管理を持ち込まずに複数端末間の自動同期を実現する。
EOF
)"
```

---

### Task 18: Playwright導入とE2Eテスト

盤面が実際に描画され、折りたたみとRealtime反映が機能することをブラウザで確認する自動テスト。Playwrightは本issueで新規導入する。

**Files:**
- Modify: `package.json`（`@playwright/test`追加、`test:e2e`スクリプト追加）
- Create: `playwright.config.ts`
- Create: `tests/e2e/board.spec.ts`
- Modify: `.gitignore`（`playwright-report/`, `test-results/`追加）

**Interfaces:**
- 既存の`lib/queries/*`, `app/page.tsx`を通しで使う。新しい公開インターフェースは無い。

- [ ] **Step 1: Playwrightを導入する**

Run: `pnpm add -D @playwright/test && pnpm exec playwright install --with-deps chromium`

- [ ] **Step 2: playwright.config.tsを作成する**

```ts
import { defineConfig } from '@playwright/test'

export default defineConfig({
  testDir: './tests/e2e',
  timeout: 30_000,
  webServer: {
    command: 'pnpm dev',
    url: 'http://localhost:3000',
    reuseExistingServer: !process.env.CI,
    timeout: 60_000,
  },
  use: {
    baseURL: 'http://localhost:3000',
  },
})
```

保存先: `playwright.config.ts`

- [ ] **Step 3: .gitignoreに追記する**

```
# playwright
/playwright-report/
/test-results/
```

`.gitignore`末尾に追記する。

- [ ] **Step 4: package.jsonにE2Eスクリプトを追加する**

`package.json`の`scripts`に追記:

```json
"test:e2e": "playwright test"
```

- [ ] **Step 5: E2Eテストを書く**

```ts
import { test, expect } from '@playwright/test'
import { createClient, type SupabaseClient } from '@supabase/supabase-js'
import type { Database } from '@/lib/supabase/database.types'

test.describe('配車・出退勤ボード', () => {
  let adminClient: SupabaseClient<Database>
  let siteId: string
  let slotId: string
  let staffId: string

  test.beforeAll(async () => {
    const url = process.env.NEXT_PUBLIC_SUPABASE_URL as string
    const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY as string
    adminClient = createClient<Database>(url, serviceRoleKey)

    const { data: site } = await adminClient
      .from('sites')
      .insert({ name: 'TEST_E2E現場', category: '運輸' })
      .select('id')
      .single()
    siteId = site!.id

    const { data: slot } = await adminClient
      .from('placement_slots')
      .insert({ site_id: siteId, department: '運輸' })
      .select('id')
      .single()
    slotId = slot!.id

    const { data: staff } = await adminClient
      .from('staff')
      .insert({ name: 'TEST_E2E運転手', department: '運輸' })
      .select('id')
      .single()
    staffId = staff!.id

    await adminClient.from('staff_placements').insert({ staff_id: staffId, slot_id: slotId })
    await adminClient
      .from('attendance_events')
      .insert({ staff_id: staffId, action: 'clockIn', occurred_at: new Date().toISOString() })
  })

  test.afterAll(async () => {
    await adminClient.from('attendance_events').delete().eq('staff_id', staffId)
    await adminClient.from('staff_placements').delete().eq('staff_id', staffId)
    await adminClient.from('staff').delete().eq('id', staffId)
    await adminClient.from('placement_slots').delete().eq('id', slotId)
    await adminClient.from('sites').delete().eq('id', siteId)
  })

  test('配置枠と担当者が盤面に表示される', async ({ page }) => {
    await page.goto('/')
    await expect(page.getByText('TEST_E2E現場①', { exact: false })).toBeVisible()
    await expect(page.getByText('TEST_E2E運転手', { exact: false })).toBeVisible()
  })

  test('見出しタップで行を折りたためる', async ({ page }) => {
    await page.goto('/')
    const heading = page.getByRole('button', { name: /TEST_E2E現場①/ })
    await expect(heading).toBeVisible()
    await heading.click()
    await expect(page.getByText('TEST_E2E運転手', { exact: false })).not.toBeVisible()
    await heading.click()
    await expect(page.getByText('TEST_E2E運転手', { exact: false })).toBeVisible()
  })
})
```

保存先: `tests/e2e/board.spec.ts`

- [ ] **Step 6: E2Eテストを実行する**

Run: `pnpm test:e2e`
Expected: 2件ともPASS

- [ ] **Step 7: コミット**

```bash
git add package.json pnpm-lock.yaml playwright.config.ts tests/e2e/board.spec.ts .gitignore
git commit -m "$(cat <<'EOF'
Playwrightを導入し盤面のE2Eテストを追加

盤面表示と折りたたみをブラウザで実際に検証するE2Eテストを追加した。
TEST_接頭辞のデータを使い、既存のVitest DB統合テストと同じ後片付け
方針に従う。
EOF
)"
```

---

### Task 19: ブラウザでの目視確認（最終チェックリスト）

自動テストではカバーしきれない見た目（縦書き・木札風の配色・レイアウト崩れ）を実際にChromeで確認する。コミットは発生しない。

**Files:** なし（確認のみ）

- [ ] **Step 1: ローカルで起動する**

Run: `pnpm dev`

- [ ] **Step 2: Chromeで開き、縦書き表示を確認する**

`http://localhost:3000`を開き、名前札・現場名札・ダンプ札の文字が縦書きで表示されること、数字が連続する部分（車両番号など）が横向きにまとまっていることを確認する。

- [ ] **Step 3: 折りたたみを確認する**

現場グループの見出しをタップして開閉できること、部門の「すべて開く」「すべて閉じる」ボタンが効くこと、初期状態が全展開であることを確認する。

- [ ] **Step 4: Realtime反映を確認する**

同じURLを2つのタブで開く。片方のタブを見ながら、Supabaseダッシュボードまたは`psql`で`attendance_events`や`staff_placements`を直接更新し、もう片方のタブが手動リロード無しで数秒以内に更新されることを確認する。

- [ ] **Step 5: 特殊グループの出し分けを確認する**

`TEST_`接頭辞の一時データを使い、現場未定・休み・空車・整備/車検/故障/使用停止のそれぞれについて、該当者・該当車両がいるときだけ表示され、いないときは表示されないことを確認する。確認後、作成した一時データは削除する。

- [ ] **Step 6: 全テストを通しで実行する**

Run: `pnpm test && npx tsc --noEmit && pnpm build`
Expected: すべて成功

このタスクの完了をもって、issue #5（盤面表示・読み取り専用）の実装完了とする。
