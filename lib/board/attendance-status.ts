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
