import { VerticalText } from './vertical-text'

export function VehicleTag({
  displayName,
  vehicleNumber,
}: {
  displayName: string
  vehicleNumber: string
}) {
  return (
    <div className="flex h-32 w-10 items-center justify-center rounded border-2 border-slate-700 bg-slate-100 text-slate-900">
      <VerticalText text={`${displayName}${vehicleNumber}`} />
    </div>
  )
}
