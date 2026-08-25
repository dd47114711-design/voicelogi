import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { createClient, type SupabaseClient } from '@supabase/supabase-js'
import { getStaffCount } from '@/lib/queries/staff'

describe('getStaffCount', () => {
  let adminClient: SupabaseClient
  let staffId: string

  beforeAll(async () => {
    const url = process.env.NEXT_PUBLIC_SUPABASE_URL as string
    const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY as string
    adminClient = createClient(url, serviceRoleKey)

    const { data, error } = await adminClient
      .from('staff')
      .insert({ name: 'TEST_getStaffCount確認用', department: '土木' })
      .select('id')
      .single()

    if (error || !data) {
      throw new Error(`テスト用staffの作成に失敗しました: ${error?.message}`)
    }
    staffId = data.id
  })

  afterAll(async () => {
    await adminClient.from('staff').delete().eq('id', staffId)
  })

  it('登録済みのstaff件数を1件以上返す', async () => {
    const count = await getStaffCount()
    expect(count).toBeGreaterThanOrEqual(1)
  })
})
