import { Suspense } from 'react'
import Link from 'next/link'
import { TAB_KEYS, tabLabel, type TabKey } from '@/lib/board/department'
import { DepartmentTabCounts } from './department-tab-counts'

/**
 * 部門タブ。選択状態は ?dept= としてURLに持たせるため、クライアント状態を持たない。
 * リロードしても同じタブに戻り、選択中の部門のクエリだけが走る。
 */
export function DepartmentTabBar({ current }: { current: TabKey }) {
  return (
    <nav aria-label="部門切替" className="flex flex-wrap gap-2">
      {TAB_KEYS.map((tab) => {
        const isCurrent = tab === current
        return (
          <Link
            key={tab}
            href={`/?dept=${tab}`}
            aria-current={isCurrent ? 'page' : undefined}
            // タッチモニター運用のため、指で確実に押せる大きさにする。
            className={`flex min-h-16 min-w-32 flex-col items-center justify-center rounded-lg px-4 ${
              isCurrent
                ? 'bg-foreground text-background'
                : 'bg-black/5 hover:bg-black/10 dark:bg-white/10 dark:hover:bg-white/20'
            }`}
          >
            <span className="text-xl font-bold">{tabLabel(tab)}</span>
            <Suspense fallback={<span className="text-sm">集計中...</span>}>
              <DepartmentTabCounts tab={tab} />
            </Suspense>
          </Link>
        )
      })}
    </nav>
  )
}
