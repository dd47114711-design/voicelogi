import { getVehicleSummary } from '@/lib/queries/vehicle-summary'

export async function VehicleSummaryBar() {
  const summary = await getVehicleSummary()
  const c = summary.counts

  return (
    <p className="text-sm">
      車両: 使用中{c.使用中}台 / 空車{c.空車}台 / 整備{c.整備}台 / 車検{c.車検}台 / 故障{c.故障}台 /
      使用停止{c.使用停止}台（合計{summary.total}台）
    </p>
  )
}
