import { describe, it, expect, vi, beforeEach } from 'vitest'

const mockFrom = vi.fn()

vi.mock('@/lib/supabase/server', () => ({
  createServerSupabaseClient: () => ({ from: mockFrom }),
}))

import { getDepartmentAttendanceCounts } from '@/lib/queries/department-attendance'

interface StaffRowFixture {
  id: string
  department: string
  staff_placements: { slot_id: string | null; placement_slots: { department: string } | null } | null
}

// getDepartmentAttendanceCounts は department で絞らず在籍者全員を取得し、
// staff_placements(slot_id, placement_slots(department)) を見て呼び出し側で
// 表示先部門を判定する。.select(...).eq('active', true).returns() と呼んで await する。
function staffQuery(rows: StaffRowFixture[]) {
  return {
    select: () => ({
      eq: () => ({
        returns: () => Promise.resolve({ data: rows, error: null }),
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
        return staffQuery([
          { id: 's1', department: '土木', staff_placements: null },
          { id: 's2', department: '土木', staff_placements: null },
          { id: 's3', department: '土木', staff_placements: null },
        ])
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

  it('土木所属だが運輸の配置枠に入っている人は、運輸のカウントに入り、土木のカウントには入らない', async () => {
    mockFrom.mockImplementation((table: string) => {
      if (table === 'staff') {
        return staffQuery([
          {
            id: 's1',
            department: '土木',
            staff_placements: { slot_id: 'slot-1', placement_slots: { department: '運輸' } },
          },
        ])
      }
      return eventQuery([
        { staff_id: 's1', action: 'clockIn', occurred_at: '2026-08-28T00:00:00.000Z' },
      ])
    })

    expect(await getDepartmentAttendanceCounts('運輸')).toEqual({ present: 1, absent: 0 })
    expect(await getDepartmentAttendanceCounts('土木')).toEqual({ present: 0, absent: 0 })
  })
})
