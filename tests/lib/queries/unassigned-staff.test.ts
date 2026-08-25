import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { createClient, type SupabaseClient } from '@supabase/supabase-js'
import type { Database } from '@/lib/supabase/database.types'
import { getUnassignedStaff } from '@/lib/queries/unassigned-staff'

describe('getUnassignedStaff', () => {
  let adminClient: SupabaseClient<Database>
  let siteId: string
  let slotId: string
  let presentUnassignedId: string
  let absentUnassignedId: string
  let placedButClockedOutId: string

  beforeAll(async () => {
    const url = process.env.NEXT_PUBLIC_SUPABASE_URL as string
    const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY as string
    adminClient = createClient<Database>(url, serviceRoleKey)

    const { data: site } = await adminClient
      .from('sites')
      .insert({ name: 'TEST_getUnassignedStaff現場', category: '運輸' })
      .select('id')
      .single()
    siteId = site!.id

    const { data: slot } = await adminClient
      .from('placement_slots')
      .insert({ site_id: siteId, department: '運輸' })
      .select('id')
      .single()
    slotId = slot!.id

    const staffInputs = [
      { name: 'TEST_現場未定出勤中', department: '運輸' as const },
      { name: 'TEST_現場未定退勤中', department: '運輸' as const },
      { name: 'TEST_配置枠あり退勤中', department: '運輸' as const },
    ]
    const { data: staffRows } = await adminClient.from('staff').insert(staffInputs).select('id, name')
    presentUnassignedId = staffRows!.find((s) => s.name === 'TEST_現場未定出勤中')!.id
    absentUnassignedId = staffRows!.find((s) => s.name === 'TEST_現場未定退勤中')!.id
    placedButClockedOutId = staffRows!.find((s) => s.name === 'TEST_配置枠あり退勤中')!.id

    await adminClient.from('staff_placements').insert([
      { staff_id: placedButClockedOutId, slot_id: slotId },
    ])

    await adminClient.from('attendance_events').insert([
      { staff_id: presentUnassignedId, action: 'clockIn', occurred_at: '2026-08-25T08:00:00Z' },
      { staff_id: placedButClockedOutId, action: 'clockOut', occurred_at: '2026-08-25T17:00:00Z' },
    ])
  })

  afterAll(async () => {
    await adminClient
      .from('attendance_events')
      .delete()
      .in('staff_id', [presentUnassignedId, absentUnassignedId, placedButClockedOutId])
    await adminClient.from('staff_placements').delete().eq('staff_id', placedButClockedOutId)
    await adminClient
      .from('staff')
      .delete()
      .in('id', [presentUnassignedId, absentUnassignedId, placedButClockedOutId])
    await adminClient.from('placement_slots').delete().eq('id', slotId)
    await adminClient.from('sites').delete().eq('id', siteId)
  })

  it('配置枠が無く出勤中の人だけをpresentで返す', async () => {
    const result = await getUnassignedStaff('運輸', 'present')
    expect(result.some((s) => s.staffId === presentUnassignedId)).toBe(true)
    expect(result.some((s) => s.staffId === absentUnassignedId)).toBe(false)
  })

  it('配置枠が無く退勤中(イベント無し含む)の人だけをabsentで返す', async () => {
    const result = await getUnassignedStaff('運輸', 'absent')
    expect(result.some((s) => s.staffId === absentUnassignedId)).toBe(true)
  })

  it('配置枠を持つ人は退勤中でも対象に含まない(配置枠に残る不変条件)', async () => {
    const result = await getUnassignedStaff('運輸', 'absent')
    expect(result.some((s) => s.staffId === placedButClockedOutId)).toBe(false)
  })
})
