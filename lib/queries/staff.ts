import { createServerSupabaseClient } from '@/lib/supabase/server'

// 読み取り専用のクエリ。Server Component からのみ呼ぶ前提のただの async 関数で、
// 'use server' は付けない（付けると公開エンドポイントとして誰でも叩けてしまう）。
// 'use server' と app/actions/ は、実際の更新処理（配車登録・出退勤打刻）用に取っておく。

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
