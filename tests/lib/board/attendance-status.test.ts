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
