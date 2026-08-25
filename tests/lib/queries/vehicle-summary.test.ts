import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { createClient, type SupabaseClient } from '@supabase/supabase-js'
import type { Database } from '@/lib/supabase/database.types'
import { getVehicleSummary } from '@/lib/queries/vehicle-summary'

describe('getVehicleSummary', () => {
  let adminClient: SupabaseClient<Database>
  let idleId: string
  let maintenanceId: string

  beforeAll(async () => {
    const url = process.env.NEXT_PUBLIC_SUPABASE_URL as string
    const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY as string
    adminClient = createClient<Database>(url, serviceRoleKey)

    const { data: vehicles } = await adminClient
      .from('vehicles')
      .insert([
        { display_name: 'TEST_空車ダンプ', vehicle_number: '81', vehicle_type: '10t', status: '使用可能' },
        { display_name: 'TEST_整備ダンプ', vehicle_number: '82', vehicle_type: '10t', status: '整備' },
      ])
      .select('id, display_name')
    idleId = vehicles!.find((v) => v.display_name === 'TEST_空車ダンプ')!.id
    maintenanceId = vehicles!.find((v) => v.display_name === 'TEST_整備ダンプ')!.id
  })

  afterAll(async () => {
    await adminClient.from('vehicles').delete().in('id', [idleId, maintenanceId])
  })

  it('使用可能で誰も使っていない車両を空車として数える', async () => {
    const summary = await getVehicleSummary()
    expect(summary.counts.空車).toBeGreaterThanOrEqual(1)
  })

  it('整備中の車両を整備として数え、合計に含める', async () => {
    const summary = await getVehicleSummary()
    expect(summary.counts.整備).toBeGreaterThanOrEqual(1)
    expect(summary.total).toBeGreaterThanOrEqual(2)
  })
})
