import type { BoardDepartment } from '@/lib/board/department'
import { createServerSupabaseClient } from '@/lib/supabase/server'
import { assignGroupLabels, type RawSlot } from '@/lib/board/group-labels'

export interface SiteGroupSummary {
  slotId: string
  label: string
  department: BoardDepartment
}

export async function getSiteGroupList(department: BoardDepartment): Promise<SiteGroupSummary[]> {
  const supabase = createServerSupabaseClient()

  const { data, error } = await supabase
    .from('placement_slots')
    .select('id, site_id, opened_at, ended_at, department, sites(name)')
    .eq('department', department)
    .order('opened_at', { ascending: true })

  if (error) {
    throw new Error(`配置枠一覧の取得に失敗しました: ${error.message}`)
  }

  const rawSlots: RawSlot[] = (data ?? []).map((row) => ({
    slotId: row.id,
    siteId: row.site_id,
    siteName: row.sites?.name ?? '現場',
    department: row.department as BoardDepartment,
    openedAt: row.opened_at,
    endedAt: row.ended_at,
  }))

  return assignGroupLabels(rawSlots)
    .filter((slot) => slot.endedAt === null)
    .map(({ slotId, label, department: dept }) => ({ slotId, label, department: dept }))
}
