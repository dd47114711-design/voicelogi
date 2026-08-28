export type AttendanceStatus = 'present' | 'absent'

/**
 * attendance_eventsを取得する際に遡る日数。
 * 運用期間が長くなるほど取得件数が増え続けるのを防ぐための探索範囲であり、
 * 出退勤の自動失効化(しきい値超えで強制的に退勤済み扱いにする機能)ではない。
 * 24時間を超える連続勤務もあり得るため、1シフトの長さより十分に長い値にする。
 */
export const ATTENDANCE_LOOKBACK_DAYS = 7

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

export function attendanceLookbackCutoff(now: Date): string {
  return new Date(now.getTime() - ATTENDANCE_LOOKBACK_DAYS * 24 * 60 * 60 * 1000).toISOString()
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
