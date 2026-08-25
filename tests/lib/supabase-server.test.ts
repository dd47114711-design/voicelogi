import { describe, expect, it } from 'vitest'
import { createServerSupabaseClient } from '@/lib/supabase/server'

describe('createServerSupabaseClient', () => {
  it('SupabaseClientを生成できる', () => {
    const client = createServerSupabaseClient()
    expect(client).toBeDefined()
    expect(typeof client.from).toBe('function')
  })

  it('環境変数が無い場合はエラーを投げる', () => {
    const originalUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
    delete process.env.NEXT_PUBLIC_SUPABASE_URL
    expect(() => createServerSupabaseClient()).toThrow()
    process.env.NEXT_PUBLIC_SUPABASE_URL = originalUrl
  })
})
