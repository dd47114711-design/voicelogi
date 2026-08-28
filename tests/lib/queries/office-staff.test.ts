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
