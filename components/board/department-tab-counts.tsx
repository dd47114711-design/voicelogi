import { getDepartmentAttendanceCounts } from '@/lib/queries/department-attendance'
import { getVehicleSummary } from '@/lib/queries/vehicle-summary'
import { departmentOfTab, type TabKey } from '@/lib/board/department'

/**
 * タブ見出しに出す出勤・退勤の人数。legacy の renderTabCounts(webapp/app.js:817-825)相当。
 * 全体確認タブにはカウントを出さない(legacyも出していない)。
 */
export async function DepartmentTabCounts({ tab }: { tab: TabKey }) {
  const department = departmentOfTab(tab)
  if (department === null) {
    return null
  }

  const attendance = await getDepartmentAttendanceCounts(department)

  if (department !== '運輸') {
    return (
      <span className="text-sm">
        出勤{attendance.present}／退勤{attendance.absent}
      </span>
    )
  }

  const vehicles = await getVehicleSummary()
  return (
    <span className="text-sm">
      出勤{attendance.present}／退勤{attendance.absent}／使用{vehicles.counts.使用中}台
    </span>
  )
}
