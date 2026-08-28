import { test, expect } from '@playwright/test'

test.describe('部門タブ', () => {
  test('初期表示は土木タブになる', async ({ page }) => {
    await page.goto('/')
    await page.waitForLoadState('networkidle')

    const tabs = page.getByRole('navigation', { name: '部門切替' })
    await expect(tabs.getByRole('link', { name: /土木/ })).toHaveAttribute('aria-current', 'page')
    await expect(page.getByRole('heading', { name: '土木部門' })).toBeVisible()
  })

  test('未知のdeptは土木タブに落とす', async ({ page }) => {
    await page.goto('/?dept=存在しない部門')
    await page.waitForLoadState('networkidle')

    await expect(page.getByRole('heading', { name: '土木部門' })).toBeVisible()
  })

  test('事務タブに切り替えるとURLと内容が変わる', async ({ page }) => {
    await page.goto('/')
    await page.waitForLoadState('networkidle')

    await page.getByRole('navigation', { name: '部門切替' }).getByRole('link', { name: /事務/ }).click()

    await expect(page).toHaveURL(/\?dept=office/)
    await expect(page.getByRole('heading', { name: '事務部門' })).toBeVisible()
    // seedで投入した事務員が出ていること
    await expect(page.getByText('黒瀬とも美', { exact: false })).toBeVisible()
    // 事務は現場を持たないので、土木部門の見出しは消えていること
    await expect(page.getByRole('heading', { name: '土木部門' })).toBeHidden()
  })

  test('全体確認タブに3部門のカードが出る', async ({ page }) => {
    await page.goto('/?dept=summary')
    await page.waitForLoadState('networkidle')

    await expect(page.getByRole('heading', { name: '全体確認' })).toBeVisible()
    await expect(page.getByRole('link', { name: '土木を開く' })).toBeVisible()
    await expect(page.getByRole('link', { name: '運輸を開く' })).toBeVisible()
    await expect(page.getByRole('link', { name: '事務を開く' })).toBeVisible()
  })

  test('全体確認のカードから部門タブへ飛べる', async ({ page }) => {
    await page.goto('/?dept=summary')
    await page.waitForLoadState('networkidle')

    await page.getByRole('link', { name: '運輸を開く' }).click()

    await expect(page).toHaveURL(/\?dept=unyu/)
    await expect(page.getByRole('heading', { name: '運輸部門' })).toBeVisible()
  })
})
