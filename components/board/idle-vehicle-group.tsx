import { getIdleVehicles } from '@/lib/queries/vehicle-groups'
import { CollapsibleSection } from './collapsible-section'
import { SiteTag } from '@/components/ui/site-tag'
import { VehicleTag } from '@/components/ui/vehicle-tag'

export async function IdleVehicleGroup() {
  const vehicles = await getIdleVehicles()
  if (vehicles.length === 0) {
    return null
  }

  return (
    <CollapsibleSection title={`空車（${vehicles.length}台）`}>
      <div className="flex flex-wrap items-start gap-4">
        <SiteTag name="空車" />
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
