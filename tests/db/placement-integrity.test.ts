import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { createClient, type SupabaseClient } from '@supabase/supabase-js'
import type { Database } from '@/lib/supabase/database.types'

describe('配置データの整合性（0003_placement_integrity）', () => {
  let adminClient: SupabaseClient<Database>
  let vehicleId: string
  let driverId: string
  let otherStaffId: string

  beforeAll(async () => {
    const url = process.env.NEXT_PUBLIC_SUPABASE_URL as string
    const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY as string
    adminClient = createClient<Database>(url, serviceRoleKey)

    const { data: vehicle, error: vehicleError } = await adminClient
      .from('vehicles')
      .insert({
        display_name: 'TEST_整合性確認用ダンプ',
        vehicle_number: 'TEST_999',
        vehicle_type: '10tダンプ',
      })
      .select('id')
      .single()
    if (vehicleError || !vehicle) {
      throw new Error(`テスト用vehiclesの作成に失敗しました: ${vehicleError?.message}`)
    }
    vehicleId = vehicle.id

    const { data: staffRows, error: staffError } = await adminClient
      .from('staff')
      .insert([
        { name: 'TEST_整合性確認用運転手A', department: '運輸' },
        { name: 'TEST_整合性確認用運転手B', department: '運輸' },
      ])
      .select('id')
    if (staffError || !staffRows || staffRows.length !== 2) {
      throw new Error(`テスト用staffの作成に失敗しました: ${staffError?.message}`)
    }
    driverId = staffRows[0].id
    otherStaffId = staffRows[1].id
  })

  afterAll(async () => {
    await adminClient.from('staff_placements').delete().in('staff_id', [driverId, otherStaffId])
    await adminClient.from('staff').delete().in('id', [driverId, otherStaffId])
    await adminClient.from('vehicles').delete().eq('id', vehicleId)
  })

  it('同じ車両を2人が同時に当日ダンプにできない', async () => {
    const { error: firstError } = await adminClient
      .from('staff_placements')
      .insert({ staff_id: driverId, assigned_vehicle_id: vehicleId })
    expect(firstError).toBeNull()

    const { error: secondError } = await adminClient
      .from('staff_placements')
      .insert({ staff_id: otherStaffId, assigned_vehicle_id: vehicleId })

    expect(secondError).not.toBeNull()
    expect(secondError?.code).toBe('23505')
  })

  it('assigned_vehicle_idがnullの行は何行でも共存できる', async () => {
    const { error } = await adminClient
      .from('staff_placements')
      .insert({ staff_id: otherStaffId, assigned_vehicle_id: null })

    expect(error).toBeNull()
  })

  it('UPDATE時にupdated_atが自動で更新される', async () => {
    const { data: before, error: beforeError } = await adminClient
      .from('staff_placements')
      .select('updated_at')
      .eq('staff_id', driverId)
      .single()
    if (beforeError || !before) {
      throw new Error(`更新前の取得に失敗しました: ${beforeError?.message}`)
    }

    const { data: after, error: afterError } = await adminClient
      .from('staff_placements')
      // updated_at を渡さずに別列だけ更新しても、トリガーが updated_at を進めるはず
      .update({ assigned_vehicle_id: null })
      .eq('staff_id', driverId)
      .select('updated_at')
      .single()
    if (afterError || !after) {
      throw new Error(`更新に失敗しました: ${afterError?.message}`)
    }

    expect(new Date(after.updated_at).getTime()).toBeGreaterThan(
      new Date(before.updated_at).getTime(),
    )
  })
})
