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

/**
 * staff_placements テーブル用のクエリビルダのモック。
 * getActiveSlotCount は staff_placements に2通りの引き方をする。
 * - occupiedRows: .select('slot_id').in('slot_id', slotIds) → 配置枠に人が入っているか
 * - drivenRows: .select('assigned_vehicle_id').not('assigned_vehicle_id', 'is', null)
 *   → 全社の運転中車両（枠での絞り込み無し）
 */
function staffPlacementsQuery(
  occupiedRows: { slot_id: string }[],
  drivenRows: { assigned_vehicle_id: string }[] = [],
) {
  const builder = {
    select: () => builder,
    in: () => Promise.resolve({ data: occupiedRows, error: null }),
    not: () => Promise.resolve({ data: drivenRows, error: null }),
  }
  return builder
}

/** vehicle_placements テーブル用のクエリビルダのモック。 */
function vehiclePlacementsQuery(rows: { vehicle_id: string; slot_id: string }[]) {
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
      if (table === 'staff_placements') {
        return staffPlacementsQuery([{ slot_id: 'a' }, { slot_id: 'a' }])
      }
      return vehiclePlacementsQuery([])
    })

    // a には人が2人いる。b と c は空なので数えない。
    expect(await getActiveSlotCount('土木')).toBe(1)
  })

  it('運転手なしのダンプが駐車している配置枠も数える', async () => {
    mockFrom.mockImplementation((table: string) => {
      if (table === 'placement_slots') return slotQuery([{ id: 'a' }, { id: 'b' }])
      if (table === 'staff_placements') return staffPlacementsQuery([{ slot_id: 'a' }])
      return vehiclePlacementsQuery([{ vehicle_id: 'v-b', slot_id: 'b' }])
    })

    // a=人がいる / b=運転手のいないダンプが駐車 のどちらも稼働扱い
    expect(await getActiveSlotCount('運輸')).toBe(2)
  })

  it('人も車もいない配置枠は数えない', async () => {
    mockFrom.mockImplementation((table: string) => {
      if (table === 'placement_slots') return slotQuery([{ id: 'a' }, { id: 'b' }])
      if (table === 'staff_placements') return staffPlacementsQuery([])
      return vehiclePlacementsQuery([])
    })

    expect(await getActiveSlotCount('運輸')).toBe(0)
  })

  it('配置枠が1つも無ければ0を返す', async () => {
    mockFrom.mockImplementation((table: string) =>
      table === 'placement_slots' ? slotQuery([]) : vehiclePlacementsQuery([]),
    )

    expect(await getActiveSlotCount('土木')).toBe(0)
  })

  it('運転中の車両の古い駐車記録がある枠は数えない', async () => {
    mockFrom.mockImplementation((table: string) => {
      if (table === 'placement_slots') return slotQuery([{ id: 'a' }, { id: 'b' }])
      if (table === 'staff_placements') {
        // 誰も枠に入っていないが、車両v1は他の枠で運転中(assigned_vehicle_id)。
        return staffPlacementsQuery([], [{ assigned_vehicle_id: 'v1' }])
      }
      // v1がかつて枠aに駐車していた古い記録が残っている。
      return vehiclePlacementsQuery([{ vehicle_id: 'v1', slot_id: 'a' }])
    })

    // v1は運転中なので、枠aの古い駐車記録は無効。稼働枠は無い。
    expect(await getActiveSlotCount('土木')).toBe(0)
  })
})
