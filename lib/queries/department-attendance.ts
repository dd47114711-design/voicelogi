import { createServerSupabaseClient } from '@/lib/supabase/server'
import type { BoardDepartment, StaffDepartment } from '@/lib/board/department'
import {
  attendanceLookbackCutoff,
  attendanceStatusByStaff,
} from '@/lib/board/attendance-status'

const NIL_UUID = '00000000-0000-0000-0000-000000000000'

export interface AttendanceCounts {
  present: number
  absent: number
}

interface StaffRow {
  id: string
  department: StaffDepartment
  staff_placements:
    | { slot_id: string | null; placement_slots: { department: BoardDepartment } | null }
    | { slot_id: string | null; placement_slots: { department: BoardDepartment } | null }[]
    | null
}

/**
 * ある従業員が「実際にどの部門のタブに表示されるか」を判定する。
 * legacyのeffectiveDisplayDept(app.js:720)と同じ規則:
 * 当日の配置枠があればその配置枠の部門、無ければ本人の基本所属。
 * 土木の作業員が運輸の配置枠に入っている日は、退勤しても運輸側に
 * 表示され続けるため、出退勤カウントもそれに合わせる。
 */
function effectiveDisplayDepartment(row: StaffRow): StaffDepartment {
  const placement = Array.isArray(row.staff_placements)
    ? row.staff_placements[0]
    : row.staff_placements

  if (placement && placement.slot_id !== null && placement.placement_slots) {
    return placement.placement_slots.department
  }

  return row.department
}

/**
 * 部門ごとの出勤中・退勤済みの人数。
 * 集計結果は保存せず、毎回 attendance_events から数え直す。
 * 打刻が1件も無い人は退勤扱い。
 *
 * 対象者は staff.department ではなく effectiveDisplayDepartment() で決める
 * (盤面のタブ見出しの数字なので、buildDepartmentLanes()と同じ条件に揃える)。
 * 事務員は配置枠を持てない(DBのCHECK制約で塞がれている)ため、
 * 常に staff.department で判定される。
 */
export async function getDepartmentAttendanceCounts(
  department: StaffDepartment,
): Promise<AttendanceCounts> {
  const supabase = createServerSupabaseClient()

  const { data: staffRows, error: staffError } = await supabase
    .from('staff')
    .select('id, department, staff_placements(slot_id, placement_slots(department))')
    .eq('active', true)
    .returns<StaffRow[]>()

  if (staffError) {
    throw new Error(`${department}の在籍者取得に失敗しました: ${staffError.message}`)
  }

  const staffIds = (staffRows ?? [])
    .filter((row) => effectiveDisplayDepartment(row) === department)
    .map((row) => row.id)

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
