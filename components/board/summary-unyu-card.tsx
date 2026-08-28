import { getDepartmentAttendanceCounts } from '@/lib/queries/department-attendance'
import { getActiveSlotCount } from '@/lib/queries/active-slot-count'
import { getVehicleSummary } from '@/lib/queries/vehicle-summary'
import { SummaryCard } from './summary-card'

export async function SummaryUnyuCard() {
  const attendance = await getDepartmentAttendanceCounts('運輸')
  const activeSlots = await getActiveSlotCount('運輸')
  const vehicles = await getVehicleSummary()

  return (
    <SummaryCard
      title="運輸"
      openTab="unyu"
      stats={[
        { label: '出勤', value: `${attendance.present}人` },
        { label: '退勤', value: `${attendance.absent}人` },
        { label: '稼働配置', value: `${activeSlots}枠` },
        { label: '使用中', value: `${vehicles.counts.使用中}台` },
        { label: '空車', value: `${vehicles.counts.空車}台` },
        { label: '整備', value: `${vehicles.counts.整備}台` },
        { label: '車検', value: `${vehicles.counts.車検}台` },
        { label: '故障', value: `${vehicles.counts.故障}台` },
        { label: '使用停止', value: `${vehicles.counts.使用停止}台` },
      ]}
    />
  )
}
