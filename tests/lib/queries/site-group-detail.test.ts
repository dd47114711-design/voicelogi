import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { createClient, type SupabaseClient } from '@supabase/supabase-js'
import type { Database } from '@/lib/supabase/database.types'
import { getSiteGroupDetail } from '@/lib/queries/site-group-detail'

describe('getSiteGroupDetail', () => {
  let adminClient: SupabaseClient<Database>
  let siteId: string
  let slotId: string
  let staffId: string
  let vehicleId: string
  let parkedVehicleId: string

  beforeAll(async () => {
    const url = process.env.NEXT_PUBLIC_SUPABASE_URL as string
    const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY as string
    adminClient = createClient<Database>(url, serviceRoleKey)

    const { data: site } = await adminClient
      .from('sites')
      .insert({ name: 'TEST_getSiteGroupDetail現場', category: '運輸' })
      .select('id')
      .single()
    siteId = site!.id

    const { data: slot } = await adminClient
      .from('placement_slots')
      .insert({ site_id: siteId, department: '運輸' })
      .select('id')
      .single()
    slotId = slot!.id

    const { data: vehicle } = await adminClient
      .from('vehicles')
      .insert({ display_name: 'TEST_運転中ダンプ', vehicle_number: '99', vehicle_type: '10t' })
      .select('id')
      .single()
    vehicleId = vehicle!.id

    const { data: parkedVehicle } = await adminClient
      .from('vehicles')
      .insert({ display_name: 'TEST_駐車中ダンプ', vehicle_number: '98', vehicle_type: '10t' })
      .select('id')
      .single()
    parkedVehicleId = parkedVehicle!.id

    const { data: staff } = await adminClient
      .from('staff')
      .insert({ name: 'TEST_getSiteGroupDetail運転手', department: '運輸' })
      .select('id')
      .single()
    staffId = staff!.id

    await adminClient
      .from('staff_placements')
      .insert({ staff_id: staffId, slot_id: slotId, assigned_vehicle_id: vehicleId })

    await adminClient.from('vehicle_placements').insert({ vehicle_id: parkedVehicleId, slot_id: slotId })

    await adminClient
      .from('attendance_events')
      .insert({ staff_id: staffId, action: 'clockIn', occurred_at: '2026-08-25T08:00:00Z' })
  })

  afterAll(async () => {
    await adminClient.from('attendance_events').delete().eq('staff_id', staffId)
    await adminClient.from('staff_placements').delete().eq('staff_id', staffId)
    await adminClient.from('vehicle_placements').delete().eq('vehicle_id', parkedVehicleId)
    await adminClient.from('staff').delete().eq('id', staffId)
    await adminClient.from('vehicles').delete().in('id', [vehicleId, parkedVehicleId])
    await adminClient.from('placement_slots').delete().eq('id', slotId)
    await adminClient.from('sites').delete().eq('id', siteId)
  })

  it('配置されている人員を出勤状態・乗車ダンプ込みで返す', async () => {
    const detail = await getSiteGroupDetail(slotId)

    const member = detail.staffMembers.find((m) => m.staffId === staffId)
    expect(member?.name).toBe('TEST_getSiteGroupDetail運転手')
    expect(member?.attendanceStatus).toBe('present')
    expect(member?.vehicle?.vehicleId).toBe(vehicleId)
  })

  it('無人駐車中のダンプをparkedVehiclesに返す', async () => {
    const detail = await getSiteGroupDetail(slotId)
    expect(detail.parkedVehicles.some((v) => v.vehicleId === parkedVehicleId)).toBe(true)
  })
})
