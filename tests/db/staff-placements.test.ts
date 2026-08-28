import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { createClient, type SupabaseClient } from '@supabase/supabase-js'

describe('staff_placements の一意制約', () => {
  let adminClient: SupabaseClient
  let staffId: string

  beforeAll(async () => {
    const url = process.env.NEXT_PUBLIC_SUPABASE_URL as string
    const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY as string
    adminClient = createClient(url, serviceRoleKey)

    const { data, error } = await adminClient
      .from('staff')
      .insert({ name: 'TEST_一意制約確認用', department: '運輸' })
      .select('id')
      .single()

    if (error || !data) {
      throw new Error(`テスト用staffの作成に失敗しました: ${error?.message}`)
    }
    staffId = data.id

    const { error: placementError } = await adminClient
      .from('staff_placements')
      .insert({ staff_id: staffId })

    if (placementError) {
      throw new Error(`テスト用staff_placementsの作成に失敗しました: ${placementError.message}`)
    }
  })

  afterAll(async () => {
    await adminClient.from('staff_placements').delete().eq('staff_id', staffId)
    await adminClient.from('staff').delete().eq('id', staffId)
  })

  it('同じstaff_idを2回登録しようとするとエラーになる', async () => {
    const { error } = await adminClient.from('staff_placements').insert({ staff_id: staffId })

    expect(error).not.toBeNull()
    expect(error?.code).toBe('23505')
  })
})
