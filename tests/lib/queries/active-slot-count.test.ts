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
