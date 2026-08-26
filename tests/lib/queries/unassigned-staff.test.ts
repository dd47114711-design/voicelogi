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
  let staleClockInId: string

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
      { name: 'TEST_古い出勤打刻のみ', department: '運輸' as const },
    ]
    const { data: staffRows } = await adminClient.from('staff').insert(staffInputs).select('id, name')
    presentUnassignedId = staffRows!.find((s) => s.name === 'TEST_現場未定出勤中')!.id
    absentUnassignedId = staffRows!.find((s) => s.name === 'TEST_現場未定退勤中')!.id
    placedButClockedOutId = staffRows!.find((s) => s.name === 'TEST_配置枠あり退勤中')!.id
    staleClockInId = staffRows!.find((s) => s.name === 'TEST_古い出勤打刻のみ')!.id

    await adminClient.from('staff_placements').insert([
      { staff_id: placedButClockedOutId, slot_id: slotId },
    ])

    const now = new Date()
    const recentClockIn = new Date(now.getTime() - 60 * 60 * 1000).toISOString()
    const recentClockOut = new Date(now.getTime() - 10 * 60 * 1000).toISOString()
    const staleClockIn = new Date(now.getTime() - 10 * 24 * 60 * 60 * 1000).toISOString()

    await adminClient.from('attendance_events').insert([
      { staff_id: presentUnassignedId, action: 'clockIn', occurred_at: recentClockIn },
      { staff_id: placedButClockedOutId, action: 'clockOut', occurred_at: recentClockOut },
      { staff_id: staleClockInId, action: 'clockIn', occurred_at: staleClockIn },
    ])
  })

  afterAll(async () => {
    await adminClient
      .from('attendance_events')
      .delete()
      .in('staff_id', [presentUnassignedId, absentUnassignedId, placedButClockedOutId, staleClockInId])
    await adminClient.from('staff_placements').delete().eq('staff_id', placedButClockedOutId)
    await adminClient
      .from('staff')
      .delete()
      .in('id', [presentUnassignedId, absentUnassignedId, placedButClockedOutId, staleClockInId])
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

  it('探索範囲(ATTENDANCE_LOOKBACK_DAYS)より古い出勤打刻しか無い人はabsent扱いになる', async () => {
    const present = await getUnassignedStaff('運輸', 'present')
    const absent = await getUnassignedStaff('運輸', 'absent')

    expect(present.some((s) => s.staffId === staleClockInId)).toBe(false)
    expect(absent.some((s) => s.staffId === staleClockInId)).toBe(true)
  })
})
