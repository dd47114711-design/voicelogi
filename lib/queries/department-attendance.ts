import { createServerSupabaseClient } from '@/lib/supabase/server'
import type { StaffDepartment } from '@/lib/board/department'
import {
  attendanceLookbackCutoff,
  attendanceStatusByStaff,
} from '@/lib/board/attendance-status'

const NIL_UUID = '00000000-0000-0000-0000-000000000000'

export interface AttendanceCounts {
  present: number
  absent: number
}

/**
 * 部門ごとの出勤中・退勤済みの人数。
 * 集計結果は保存せず、毎回 attendance_events から数え直す。
 * 打刻が1件も無い人は退勤扱い。
 */
export async function getDepartmentAttendanceCounts(
  department: StaffDepartment,
): Promise<AttendanceCounts> {
  const supabase = createServerSupabaseClient()

  const { data: staffRows, error: staffError } = await supabase
    .from('staff')
    .select('id')
    .eq('department', department)
    .eq('active', true)

  if (staffError) {
    throw new Error(`${department}の在籍者取得に失敗しました: ${staffError.message}`)
  }

  const staffIds = (staffRows ?? []).map((row) => row.id)

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

  let present = 0
  for (const id of staffIds) {
    if ((statusByStaff.get(id) ?? 'absent') === 'present') {
      present += 1
    }
  }

  return { present, absent: staffIds.length - present }
}
