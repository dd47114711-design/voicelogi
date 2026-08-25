import { afterAll, describe, expect, it } from 'vitest'
import { createClient, type SupabaseClient } from '@supabase/supabase-js'

describe('RLS: anonキーでのアクセス', () => {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL as string
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY as string
  const anonClient: SupabaseClient = createClient(url, anonKey)

  let insertedId: string | undefined

  afterAll(async () => {
    if (!insertedId) return
    const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY as string
    const adminClient = createClient(url, serviceRoleKey)
    await adminClient.from('sites').delete().eq('id', insertedId)
  })

  it('anonキーでsitesをselectできる', async () => {
    const { error } = await anonClient.from('sites').select('id').limit(1)
    expect(error).toBeNull()
  })

  it('anonキーでsitesにinsertできる', async () => {
    const { data, error } = await anonClient
      .from('sites')
      .insert({ name: 'TEST_RLS確認用現場', category: '運輸' })
      .select('id')
      .single()

    expect(error).toBeNull()
    expect(data?.id).toBeDefined()
    insertedId = data?.id
  })

  it('anonキーでsitesをdeleteできない', async () => {
    if (!insertedId) throw new Error('insertテストが先に成功している必要があります')
    const { error, count } = await anonClient
      .from('sites')
      .delete({ count: 'exact' })
      .eq('id', insertedId)

    expect(error === null && count === 0).toBe(true)
  })
})
