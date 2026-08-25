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
  department: '土木' | '運輸'
}) {
  const detail = await getSiteGroupDetail(slotId)
  const drivenVehicles = detail.staffMembers.filter((m) => m.vehicle)
  const vehicleCount = drivenVehicles.length + detail.parkedVehicles.length
  const title =
    department === '運輸'
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
        {department === '運輸' ? (
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
