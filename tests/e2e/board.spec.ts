import { test, expect } from '@playwright/test'
import { createClient, type SupabaseClient } from '@supabase/supabase-js'
import type { Database } from '@/lib/supabase/database.types'

test.describe('配車・出退勤ボード', () => {
  let adminClient: SupabaseClient<Database>
  let siteId: string
  let slotId: string
  let staffId: string

  test.beforeAll(async () => {
    const url = process.env.NEXT_PUBLIC_SUPABASE_URL as string
    const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY as string
    adminClient = createClient<Database>(url, serviceRoleKey)

    const { data: site } = await adminClient
      .from('sites')
      .insert({ name: 'TEST_E2E現場', category: '運輸' })
      .select('id')
      .single()
    siteId = site!.id

    const { data: slot } = await adminClient
      .from('placement_slots')
      .insert({ site_id: siteId, department: '運輸' })
      .select('id')
      .single()
    slotId = slot!.id

    const { data: staff } = await adminClient
      .from('staff')
      .insert({ name: 'TEST_E2E運転手', department: '運輸' })
      .select('id')
      .single()
    staffId = staff!.id

    await adminClient.from('staff_placements').insert({ staff_id: staffId, slot_id: slotId })
    await adminClient
      .from('attendance_events')
      .insert({ staff_id: staffId, action: 'clockIn', occurred_at: new Date().toISOString() })
  })

  test.afterAll(async () => {
    await adminClient.from('attendance_events').delete().eq('staff_id', staffId)
    await adminClient.from('staff_placements').delete().eq('staff_id', staffId)
    await adminClient.from('staff').delete().eq('id', staffId)
    await adminClient.from('placement_slots').delete().eq('id', slotId)
    await adminClient.from('sites').delete().eq('id', siteId)
  })

  test('配置枠と担当者が盤面に表示される', async ({ page }) => {
    // 盤面が部門タブ化されたため、運輸のフィクスチャは運輸タブで確認する。
    await page.goto('/?dept=unyu')
    // 初回ナビゲーション直後はSuspenseの読み込み中表示（例:「〜を読み込み中...」）と
    // 解決後の本表示が一瞬同時にDOMへ残ることがあり、曖昧一致だとstrict mode違反になる。
    // ネットワークが落ち着く＝ストリーミングが完了するまで待ってから照合する。
    await page.waitForLoadState('networkidle')
    // 現場名は見出しボタンと縦書きの現場札の両方に表示される仕様のため、
    // テキストの曖昧一致ではなく見出しボタンをピンポイントで検証する。
    await expect(page.getByRole('button', { name: /TEST_E2E現場①/ })).toBeVisible()
    await expect(page.getByText('TEST_E2E運転手', { exact: false })).toBeVisible()
  })

  test('見出しタップで行を折りたためる', async ({ page }) => {
    // 盤面が部門タブ化されたため、運輸のフィクスチャは運輸タブで確認する。
    await page.goto('/?dept=unyu')
    const heading = page.getByRole('button', { name: /TEST_E2E現場①/ })
    await expect(heading).toBeVisible()
    await heading.click()
    await expect(page.getByText('TEST_E2E運転手', { exact: false })).not.toBeVisible()
    await heading.click()
    await expect(page.getByText('TEST_E2E運転手', { exact: false })).toBeVisible()
  })
})
