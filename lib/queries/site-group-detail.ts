import { createServerSupabaseClient } from '@/lib/supabase/server'
import { attendanceStatusByStaff, type AttendanceStatus } from '@/lib/board/attendance-status'

const NIL_UUID = '00000000-0000-0000-0000-000000000000'

export interface SiteGroupDetail {
  staffMembers: Array<{
    staffId: string
    name: string
    attendanceStatus: AttendanceStatus
    vehicle: { vehicleId: string; displayName: string; vehicleNumber: string } | null
  }>
  parkedVehicles: Array<{ vehicleId: string; displayName: string; vehicleNumber: string }>
}

interface StaffPlacementRow {
  staff_id: string
  staff: { name: string } | null
  assigned_vehicle_id: string | null
  vehicles: { id: string; display_name: string; vehicle_number: string } | null
}

interface VehiclePlacementRow {
  vehicle_id: string
  vehicles: { display_name: string; vehicle_number: string } | null
}

export async function getSiteGroupDetail(slotId: string): Promise<SiteGroupDetail> {
  const supabase = createServerSupabaseClient()

  const { data: staffRows, error: staffError } = await supabase
    .from('staff_placements')
    .select('staff_id, staff(name), assigned_vehicle_id, vehicles:assigned_vehicle_id(id, display_name, vehicle_number)')
    .eq('slot_id', slotId)
    .returns<StaffPlacementRow[]>()

  if (staffError) {
    throw new Error(`配置枠の人員取得に失敗しました: ${staffError.message}`)
  }

  const staffIds = (staffRows ?? []).map((row) => row.staff_id)

  const { data: eventRows, error: eventError } = await supabase
    .from('attendance_events')
    .select('staff_id, action, occurred_at')
    .in('staff_id', staffIds.length > 0 ? staffIds : [NIL_UUID])

  if (eventError) {
    throw new Error(`出退勤イベントの取得に失敗しました: ${eventError.message}`)
  }

  const statusByStaff = attendanceStatusByStaff(
    (eventRows ?? []).map((row) => ({
      staffId: row.staff_id,
      action: row.action as 'clockIn' | 'clockOut',
      occurredAt: row.occurred_at,
    })),
  )

  const { data: parkedRows, error: parkedError } = await supabase
    .from('vehicle_placements')
    .select('vehicle_id, vehicles(display_name, vehicle_number)')
    .eq('slot_id', slotId)
    .returns<VehiclePlacementRow[]>()

  if (parkedError) {
    throw new Error(`駐車車両の取得に失敗しました: ${parkedError.message}`)
  }

  return {
    staffMembers: (staffRows ?? []).map((row) => ({
      staffId: row.staff_id,
      name: row.staff?.name ?? '',
      attendanceStatus: statusByStaff.get(row.staff_id) ?? 'absent',
      vehicle: row.vehicles
        ? {
            vehicleId: row.vehicles.id,
            displayName: row.vehicles.display_name,
            vehicleNumber: row.vehicles.vehicle_number,
          }
        : null,
    })),
    parkedVehicles: (parkedRows ?? []).map((row) => ({
      vehicleId: row.vehicle_id,
      displayName: row.vehicles?.display_name ?? '',
      vehicleNumber: row.vehicles?.vehicle_number ?? '',
    })),
  }
}
