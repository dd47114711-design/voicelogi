// サイドバーのメニュー定義。旧実装（legacy/webapp/index.html）のヘッダー右側にあった
// 管理メニューを移設したもの。
// 旧実装にあった「保存データ消去」は localStorage 前提の機能のため引き継がない。
export type MenuItem = {
  href: string
  label: string
}

export const MENU_ITEMS: readonly MenuItem[] = [
  { href: '/', label: '配車盤面' },
  { href: '/schedule', label: 'スケジュール管理' },
  { href: '/staff', label: '従業員管理' },
  { href: '/sites', label: '現場管理' },
  { href: '/attendance', label: '出退勤記録' },
  { href: '/vehicles', label: '車両管理' },
]
