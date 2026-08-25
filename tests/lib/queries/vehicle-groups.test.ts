import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { createClient, type SupabaseClient } from '@supabase/supabase-js'
import type { Database } from '@/lib/supabase/database.types'
import { getIdleVehicles, getVehiclesByStatus } from '@/lib/queries/vehicle-groups'

describe('vehicle-groups', () => {
  let adminClient: SupabaseClient<Database>
  let idleId: string
  let brokenId: string

  beforeAll(async () => {
    const url = process.env.NEXT_PUBLIC_SUPABASE_URL as string
    const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY as string
    adminClient = createClient<Database>(url, serviceRoleKey)

    const { data: vehicles } = await adminClient
      .from('vehicles')
      .insert([
        { display_name: 'TEST_空車グループ用', vehicle_number: '71', vehicle_type: '10t', status: '使用可能' },
        { display_name: 'TEST_故障グループ用', vehicle_number: '72', vehicle_type: '10t', status: '故障' },
      ])
      .select('id, display_name')
    idleId = vehicles!.find((v) => v.display_name === 'TEST_空車グループ用')!.id
    brokenId = vehicles!.find((v) => v.display_name === 'TEST_故障グループ用')!.id
  })

  afterAll(async () => {
    await adminClient.from('vehicles').delete().in('id', [idleId, brokenId])
  })

  it('getIdleVehiclesは使用可能で誰も使っていない車両を返す', async () => {
    const vehicles = await getIdleVehicles()
    expect(vehicles.some((v) => v.vehicleId === idleId)).toBe(true)
    expect(vehicles.some((v) => v.vehicleId === brokenId)).toBe(false)
  })

  it('getVehiclesByStatusは指定ステータスの車両だけを返す', async () => {
    const vehicles = await getVehiclesByStatus('故障')
    expect(vehicles.some((v) => v.vehicleId === brokenId)).toBe(true)
    expect(vehicles.some((v) => v.vehicleId === idleId)).toBe(false)
  })
})
