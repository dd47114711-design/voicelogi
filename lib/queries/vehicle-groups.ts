import { createServerSupabaseClient } from '@/lib/supabase/server'
import { classifyVehicle } from '@/lib/board/vehicle-category'

export interface VehicleGroupItem {
  vehicleId: string
  displayName: string
  vehicleNumber: string
}

export async function getIdleVehicles(): Promise<VehicleGroupItem[]> {
  const supabase = createServerSupabaseClient()

  const { data: vehicles, error: vehicleError } = await supabase
    .from('vehicles')
    .select('id, display_name, vehicle_number')
    .eq('active', true)
    .eq('status', '使用可能')

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

  return (vehicles ?? [])
    .filter(
      (v) =>
        classifyVehicle({ status: '使用可能', isDriven: drivenIds.has(v.id), isParkedAtSite: parkedIds.has(v.id) }) ===
        '空車',
    )
    .map((v) => ({ vehicleId: v.id, displayName: v.display_name, vehicleNumber: v.vehicle_number }))
}

export async function getVehiclesByStatus(
  status: '整備' | '車検' | '故障' | '使用停止',
): Promise<VehicleGroupItem[]> {
  const supabase = createServerSupabaseClient()

  const { data, error } = await supabase
    .from('vehicles')
    .select('id, display_name, vehicle_number')
    .eq('active', true)
    .eq('status', status)

  if (error) {
    throw new Error(`車両一覧の取得に失敗しました: ${error.message}`)
  }

  return (data ?? []).map((v) => ({
    vehicleId: v.id,
    displayName: v.display_name,
    vehicleNumber: v.vehicle_number,
  }))
}
