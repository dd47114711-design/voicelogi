import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { createClient, type SupabaseClient } from '@supabase/supabase-js'
import type { Database } from '@/lib/supabase/database.types'
import { getSiteGroupList } from '@/lib/queries/site-groups'

describe('getSiteGroupList', () => {
  let adminClient: SupabaseClient<Database>
  let siteId: string
  let slotId1: string
  let slotId2: string

  beforeAll(async () => {
    const url = process.env.NEXT_PUBLIC_SUPABASE_URL as string
    const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY as string
    adminClient = createClient<Database>(url, serviceRoleKey)

    const { data: site, error: siteError } = await adminClient
      .from('sites')
      .insert({ name: 'TEST_getSiteGroupList現場', category: '運輸' })
      .select('id')
      .single()
    if (siteError || !site) throw new Error(`テスト用siteの作成に失敗しました: ${siteError?.message}`)
    siteId = site.id

    const { data: slot1, error: slot1Error } = await adminClient
      .from('placement_slots')
      .insert({ site_id: siteId, department: '運輸', opened_at: '2026-01-01T00:00:00Z' })
      .select('id')
      .single()
    if (slot1Error || !slot1) throw new Error(`テスト用配置枠1の作成に失敗しました: ${slot1Error?.message}`)
    slotId1 = slot1.id

    const { data: slot2, error: slot2Error } = await adminClient
      .from('placement_slots')
      .insert({ site_id: siteId, department: '運輸', opened_at: '2026-01-02T00:00:00Z' })
      .select('id')
      .single()
    if (slot2Error || !slot2) throw new Error(`テスト用配置枠2の作成に失敗しました: ${slot2Error?.message}`)
    slotId2 = slot2.id
  })

  afterAll(async () => {
    await adminClient.from('placement_slots').delete().in('id', [slotId1, slotId2])
    await adminClient.from('sites').delete().eq('id', siteId)
  })

  it('同じ現場の配置枠に開設順で丸数字ラベルを付けて返す', async () => {
    const groups = await getSiteGroupList('運輸')

    expect(groups.find((g) => g.slotId === slotId1)?.label).toBe('TEST_getSiteGroupList現場①')
    expect(groups.find((g) => g.slotId === slotId2)?.label).toBe('TEST_getSiteGroupList現場②')
  })

  it('部門が違う配置枠は含まれない', async () => {
    const groups = await getSiteGroupList('土木')
    expect(groups.find((g) => g.slotId === slotId1)).toBeUndefined()
  })
})
