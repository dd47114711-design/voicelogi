import type { BoardDepartment } from '@/lib/board/department'
import { getSiteGroupDetail } from '@/lib/queries/site-group-detail'
import { CollapsibleSection } from './collapsible-section'
import { NameTag } from '@/components/ui/name-tag'
import { SiteTag } from '@/components/ui/site-tag'
import { VehicleTag } from '@/components/ui/vehicle-tag'

export async function SiteGroupCard({
  slotId,
  label,
  department,
}: {
  slotId: string
  label: string
  department: BoardDepartment
}) {
  const detail = await getSiteGroupDetail(slotId)

  if (detail.staffMembers.length === 0 && detail.parkedVehicles.length === 0) {
    return null
  }

  const drivenVehicles = detail.staffMembers.filter((m) => m.vehicle)
  const vehicleCount = drivenVehicles.length + detail.parkedVehicles.length
  // 車両欄の表示可否は部門ではなくデータで決める。土木の作業員が運輸のダンプに
  // 乗っている日は、土木側の配置枠でも車両札を出す必要があるため。
  const title =
    vehicleCount > 0
      ? `${label}（${detail.staffMembers.length}人/${vehicleCount}台）`
      : `${label}（${detail.staffMembers.length}人）`

  return (
    <CollapsibleSection title={title}>
      <div className="flex flex-wrap items-start gap-4">
        <div className="flex flex-wrap gap-2">
          {detail.staffMembers.map((member) => (
            <NameTag key={member.staffId} name={member.name} status={member.attendanceStatus} />
          ))}
        </div>
        <SiteTag name={label} />
        {vehicleCount > 0 ? (
          <div className="flex flex-wrap gap-2">
            {drivenVehicles.map((member) => (
              <VehicleTag
                key={member.vehicle!.vehicleId}
                displayName={member.vehicle!.displayName}
                vehicleNumber={member.vehicle!.vehicleNumber}
              />
            ))}
            {detail.parkedVehicles.map((vehicle) => (
              <VehicleTag
                key={vehicle.vehicleId}
                displayName={vehicle.displayName}
                vehicleNumber={vehicle.vehicleNumber}
              />
            ))}
          </div>
        ) : null}
      </div>
    </CollapsibleSection>
  )
}
