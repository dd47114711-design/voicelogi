import { getDepartmentAttendanceCounts } from '@/lib/queries/department-attendance'
import { getActiveSlotCount } from '@/lib/queries/active-slot-count'
import { SummaryCard } from './summary-card'

export async function SummaryDobokuCard() {
  const attendance = await getDepartmentAttendanceCounts('土木')
  const activeSlots = await getActiveSlotCount('土木')

  return (
    <SummaryCard
      title="土木"
      openTab="doboku"
      stats={[
        { label: '出勤', value: `${attendance.present}人` },
        { label: '退勤', value: `${attendance.absent}人` },
        { label: '稼働現場', value: `${activeSlots}箇所` },
      ]}
    />
  )
}
