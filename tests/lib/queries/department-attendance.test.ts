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
