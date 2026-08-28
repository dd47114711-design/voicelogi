'use client'

import { useState, type ReactNode } from 'react'
import { MenuToggleButton } from './menu-toggle-button'
import { Sidebar } from './sidebar'

// サイドバー + メインエリアの土台。開閉状態だけを持つ薄いクライアント境界にとどめ、
// children（各ページのServer Component）はそのまま流す。
export function AppShell({ children }: { children: ReactNode }) {
  const [isSidebarOpen, setIsSidebarOpen] = useState(false)
  const close = () => setIsSidebarOpen(false)

  return (
    <div className="flex min-h-full flex-col">
      <MenuToggleButton onClick={() => setIsSidebarOpen(true)} />

      {isSidebarOpen && (
        // 盤面を押し出さないよう、サイドバーはオーバーレイで重ねる。
        <div className="fixed inset-0 z-50 flex">
          <Sidebar onClose={close} />
          <div
            data-testid="sidebar-backdrop"
            onClick={close}
            className="flex-1 bg-black/50"
          />
        </div>
      )}

      <div className="flex-1">{children}</div>
    </div>
  )
}
