import { createServerSupabaseClient } from '@/lib/supabase/server'
import { classifyVehicle, type VehicleCategory, type VehicleStatus } from '@/lib/board/vehicle-category'

export interface VehicleSummary {
  counts: Record<VehicleCategory, number>
  total: number
}

const EMPTY_COUNTS: Record<VehicleCategory, number> = {
  使用中: 0,
  空車: 0,
  整備: 0,
  車検: 0,
  故障: 0,
  使用停止: 0,
}

export async function getVehicleSummary(): Promise<VehicleSummary> {
  const supabase = createServerSupabaseClient()

  const { data: vehicles, error: vehicleError } = await supabase
    .from('vehicles')
    .select('id, status')
    .eq('active', true)

  if (vehicleError) {
    throw new Error(`車両一覧の取得に失敗しました: ${vehicleError.message}`)
  }

  const { data: drivenRows, error: drivenError } = await supabase
    .from('staff_placements')
    .select('assigned_vehicle_id')
    .not('assigned_vehicle_id', 'is', null)

  if (drivenError) {
    throw new Error(`運転中車両の取得に失敗しました: ${drivenError.message}`)
  }

  const { data: parkedRows, error: parkedError } = await supabase
    .from('vehicle_placements')
    .select('vehicle_id')
    .not('slot_id', 'is', null)

  if (parkedError) {
    throw new Error(`駐車車両の取得に失敗しました: ${parkedError.message}`)
  }

  const drivenIds = new Set((drivenRows ?? []).map((row) => row.assigned_vehicle_id as string))
  const parkedIds = new Set((parkedRows ?? []).map((row) => row.vehicle_id))

  const counts = { ...EMPTY_COUNTS }
  for (const vehicle of vehicles ?? []) {
    const category = classifyVehicle({
      status: vehicle.status as VehicleStatus,
      isDriven: drivenIds.has(vehicle.id),
      isParkedAtSite: parkedIds.has(vehicle.id),
    })
    counts[category] += 1
  }

  return { counts, total: (vehicles ?? []).length }
}
