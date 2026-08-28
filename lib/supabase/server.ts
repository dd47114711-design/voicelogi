import { createClient, type SupabaseClient } from '@supabase/supabase-js'
import type { Database } from './database.types'

export function createServerSupabaseClient(): SupabaseClient<Database> {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY

  if (!url || !anonKey) {
    throw new Error(
      'Supabase接続情報(NEXT_PUBLIC_SUPABASE_URL / NEXT_PUBLIC_SUPABASE_ANON_KEY)が設定されていません',
    )
  }

  return createClient<Database>(url, anonKey)
}
