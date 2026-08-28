'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { MENU_ITEMS } from '@/lib/navigation/menu-items'

type SidebarNavProps = {
  onNavigate: () => void
}

export function SidebarNav({ onNavigate }: SidebarNavProps) {
  const pathname = usePathname()

  return (
    <ul className="flex flex-col gap-2 p-4">
      {MENU_ITEMS.map((item) => {
        const isCurrent = pathname === item.href
        return (
          <li key={item.href}>
            <Link
              href={item.href}
              onClick={onNavigate}
              aria-current={isCurrent ? 'page' : undefined}
              // 現場のタッチモニター運用のため、指で確実に押せる高さを確保する。
              className={`flex min-h-16 items-center rounded-lg px-4 text-xl ${
                isCurrent
                  ? 'bg-foreground text-background'
                  : 'bg-black/5 hover:bg-black/10 dark:bg-white/10 dark:hover:bg-white/20'
              }`}
            >
              {item.label}
            </Link>
          </li>
        )
      })}
    </ul>
  )
}
