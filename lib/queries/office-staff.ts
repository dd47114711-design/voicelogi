import { createServerSupabaseClient } from '@/lib/supabase/server'
import {
  attendanceLookbackCutoff,
  attendanceStatusByStaff,
  type AttendanceStatus,
} from '@/lib/board/attendance-status'

const NIL_UUID = '00000000-0000-0000-0000-000000000000'

export interface OfficeStaffMember {
  staffId: string
  name: string
  status: AttendanceStatus
}

/**
 * 事務部門の在籍者を、出退勤状態つきで表示順に返す。
 * 事務員は配置枠を持たないため、土木・運輸のように「現場未定」「休み」で
 * 分けず、全員を1つの一覧として返す。
 */
export async function getOfficeStaff(): Promise<OfficeStaffMember[]> {
  const supabase = createServerSupabaseClient()

  const { data: staffRows, error: staffError } = await supabase
    .from('staff')
    .select('id, name')
    .eq('department', '事務')
    .eq('active', true)
    .order('display_order', { ascending: true })

  if (staffError) {
    throw new Error(`事務員一覧の取得に失敗しました: ${staffError.message}`)
  }

  const staff = staffRows ?? []
  const staffIds = staff.map((row) => row.id)

  const { data: eventRows, error: eventError } = await supabase
    .from('attendance_events')
    .select('staff_id, action, occurred_at')
    .in('staff_id', staffIds.length > 0 ? staffIds : [NIL_UUID])
    .gte('occurred_at', attendanceLookbackCutoff(new Date()))

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

  return staff.map((row) => ({
    staffId: row.id,
    name: row.name,
    status: statusByStaff.get(row.id) ?? 'absent',
  }))
}
