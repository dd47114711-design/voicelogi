import { createServerSupabaseClient } from '@/lib/supabase/server'
import type { BoardDepartment } from '@/lib/board/department'

/**
 * 稼働中の配置枠の数。
 * 「人が1人以上入っている枠」または「運転手の乗っていないダンプが駐車している枠」を数える。
 * 空の枠は数えない。作っただけで誰も入っていない枠を稼働として見せないため。
 * legacy の deptActiveGroupCount（webapp/app.js:801-810）は無人ダンプの判定を運輸部門に
 * 限定していたが、新スキーマでは配置枠自身が department を持ち、その部門の枠しか見ないため
 * ここでは部門による限定をしない。
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

  // vehicle_placements.slot_id は、その車両を staff_placements.assigned_vehicle_id として
  // 参照している行が無い（＝無人で置かれている）ときだけ正解になる。運転手が乗り込んだ後は
  // vehicle_placements 側の駐車記録が古いまま残ることがあるため、全社（部門・枠の絞り込み無し）の
  // 乗車状況を見て運転中の車両を除外する。他部門の枠にいる運転手が、この部門の枠に古い駐車記録が
  // 残る車両を運転している場合があるため、slotIds では絞り込まない。
  const { data: drivenRows, error: drivenError } = await supabase
    .from('staff_placements')
    .select('assigned_vehicle_id')
    .not('assigned_vehicle_id', 'is', null)

  if (drivenError) {
    throw new Error(`運転中車両の取得に失敗しました: ${drivenError.message}`)
  }

  // slotIds が空のときは上で早期リターンしているので、ここでは必ず1件以上ある。
  const { data: vehicleRows, error: vehicleError } = await supabase
    .from('vehicle_placements')
    .select('vehicle_id, slot_id')
    .in('slot_id', slotIds)

  if (vehicleError) {
    throw new Error(`駐車中の車両取得に失敗しました: ${vehicleError.message}`)
  }

  const drivenIds = new Set((drivenRows ?? []).map((row) => row.assigned_vehicle_id as string))

  const occupied = new Set<string>()
  for (const row of staffRows ?? []) {
    if (row.slot_id !== null) occupied.add(row.slot_id)
  }
  for (const row of vehicleRows ?? []) {
    if (row.slot_id !== null && !drivenIds.has(row.vehicle_id)) {
      occupied.add(row.slot_id)
    }
  }

  return slotIds.filter((id) => occupied.has(id)).length
}
