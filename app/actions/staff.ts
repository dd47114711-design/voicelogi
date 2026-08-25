'use server'

import { createServerSupabaseClient } from '@/lib/supabase/server'

export async function getStaffCount(): Promise<number> {
  const supabase = createServerSupabaseClient()
  const { count, error } = await supabase
    .from('staff')
    .select('*', { count: 'exact', head: true })

  if (error) {
    throw new Error(`staff件数の取得に失敗しました: ${error.message}`)
  }

  return count ?? 0
}
