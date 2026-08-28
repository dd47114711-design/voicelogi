import { test, expect } from '@playwright/test'

test.describe('AppShell のサイドバー', () => {
  test('初期状態では閉じており、ハンバーガーで開いてバックドロップで閉じる', async ({ page }) => {
    await page.goto('/')

    const sidebar = page.getByRole('navigation', { name: 'メインメニュー' })
    await expect(sidebar).toBeHidden()

    await page.getByRole('button', { name: 'メニューを開く' }).click()
    await expect(sidebar).toBeVisible()

    // 旧実装のヘッダーから移設したメニューが並んでいること。
    await expect(sidebar.getByRole('link', { name: '配車盤面' })).toBeVisible()
    await expect(sidebar.getByRole('link', { name: '従業員管理' })).toBeVisible()
    await expect(sidebar.getByRole('link', { name: '出退勤記録' })).toBeVisible()

    // 盤面を広く使うため、サイドバーの外側をタップしただけで閉じられる。
    await page.getByTestId('sidebar-backdrop').click()
    await expect(sidebar).toBeHidden()
  })

  test('メニューから未実装ページへ遷移できる', async ({ page }) => {
    await page.goto('/')

    await page.getByRole('button', { name: 'メニューを開く' }).click()
    await page.getByRole('link', { name: '従業員管理' }).click()

    await expect(page).toHaveURL(/\/staff$/)
    await expect(page.getByRole('heading', { name: '従業員管理' })).toBeVisible()
    // 遷移したらサイドバーは閉じ、メインエリアだけが見えている状態に戻る。
    await expect(page.getByRole('navigation', { name: 'メインメニュー' })).toBeHidden()
  })
})
