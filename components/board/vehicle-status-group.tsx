import { getVehiclesByStatus } from '@/lib/queries/vehicle-groups'
import { CollapsibleSection } from './collapsible-section'
import { SiteTag } from '@/components/ui/site-tag'
import { VehicleTag } from '@/components/ui/vehicle-tag'

export async function VehicleStatusGroup({
  status,
}: {
  status: '整備' | '車検' | '故障' | '使用停止'
}) {
  const vehicles = await getVehiclesByStatus(status)
  if (vehicles.length === 0) {
    return null
  }

  return (
    <CollapsibleSection title={`${status}（${vehicles.length}台）`}>
      <div className="flex flex-wrap items-start gap-4">
        <SiteTag name={status} />
        <div className="flex flex-wrap gap-2">
          {vehicles.map((vehicle) => (
            <VehicleTag
              key={vehicle.vehicleId}
              displayName={vehicle.displayName}
              vehicleNumber={vehicle.vehicleNumber}
            />
          ))}
        </div>
      </div>
    </CollapsibleSection>
  )
}
