import { createServerSupabaseClient } from '@/lib/supabase/server'
import type { BoardDepartment } from '@/lib/board/department'

/**
 * 稼働中の配置枠の数。
 * legacy の deptActiveGroupCount(webapp/app.js:801-810)と同じ数え方で、
 * 「人が1人以上入っている枠」または「運転手なしのダンプが駐車している枠」を数える。
 * 空の枠は数えない。作っただけで誰も入っていない枠を稼働として見せないため。
 */
export async function getActiveSlotCount(department: BoardDepartment): Promise<number> {
  const supabase = createServerSupabaseClient()

  const { data: slotRows, error: slotError } = await supabase
    .from('placement_slots')
    .select('id')
    .eq('department', department)
    .is('ended_at', null)

  if (slotError) {
    throw new Error(`${department}の配置枠取得に失敗しました: ${slotError.message}`)
  }

  const slotIds = (slotRows ?? []).map((row) => row.id)
  if (slotIds.length === 0) {
    return 0
  }

  const { data: staffRows, error: staffError } = await supabase
    .from('staff_placements')
    .select('slot_id')
    .in('slot_id', slotIds)

  if (staffError) {
    throw new Error(`配置中の人員取得に失敗しました: ${staffError.message}`)
  }

  // slotIds が空のときは上で早期リターンしているので、ここでは必ず1件以上ある。
  const { data: vehicleRows, error: vehicleError } = await supabase
    .from('vehicle_placements')
    .select('slot_id')
    .in('slot_id', slotIds)

  if (vehicleError) {
    throw new Error(`駐車中の車両取得に失敗しました: ${vehicleError.message}`)
  }

  const occupied = new Set<string>()
  for (const row of staffRows ?? []) {
    if (row.slot_id !== null) occupied.add(row.slot_id)
  }
  for (const row of vehicleRows ?? []) {
    if (row.slot_id !== null) occupied.add(row.slot_id)
  }

  return slotIds.filter((id) => occupied.has(id)).length
}
