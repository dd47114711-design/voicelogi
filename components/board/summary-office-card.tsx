import { getDepartmentAttendanceCounts } from '@/lib/queries/department-attendance'
import { SummaryCard } from './summary-card'

export async function SummaryOfficeCard() {
  const attendance = await getDepartmentAttendanceCounts('事務')

  return (
    <SummaryCard
      title="事務"
      openTab="office"
      stats={[
        { label: '出勤', value: `${attendance.present}人` },
        { label: '退勤', value: `${attendance.absent}人` },
      ]}
    />
  )
}
