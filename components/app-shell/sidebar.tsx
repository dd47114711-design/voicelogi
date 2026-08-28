'use client'

import { SidebarNav } from './sidebar-nav'
import { FullscreenToggleButton } from './fullscreen-toggle-button'

type SidebarProps = {
  onClose: () => void
}

export function Sidebar({ onClose }: SidebarProps) {
  return (
    <nav
      aria-label="メインメニュー"
      className="flex w-80 max-w-[85vw] flex-col overflow-y-auto border-r border-black/10 bg-background dark:border-white/15"
    >
      <div className="flex items-center justify-between border-b border-black/10 p-4 dark:border-white/15">
        <p className="text-lg font-bold">メニュー</p>
        <button
          type="button"
          aria-label="メニューを閉じる"
          onClick={onClose}
          className="flex size-14 items-center justify-center rounded-lg text-3xl hover:bg-black/10 dark:hover:bg-white/20"
        >
          ×
        </button>
      </div>

      <SidebarNav onNavigate={onClose} />

      <div className="mt-auto border-t border-black/10 p-4 dark:border-white/15">
        <FullscreenToggleButton />
      </div>
    </nav>
  )
}
