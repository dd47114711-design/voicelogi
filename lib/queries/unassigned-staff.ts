import { createServerSupabaseClient } from '@/lib/supabase/server'
import { attendanceStatusByStaff, type AttendanceStatus } from '@/lib/board/attendance-status'

const NIL_UUID = '00000000-0000-0000-0000-000000000000'

export interface UnassignedStaffMember {
  staffId: string
  name: string
}

interface StaffRow {
  id: string
  name: string
  staff_placements: { slot_id: string | null } | { slot_id: string | null }[] | null
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
    .returns<StaffRow[]>()

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
