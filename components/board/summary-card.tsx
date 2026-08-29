import Link from 'next/link'
import type { TabKey } from '@/lib/board/department'

export interface SummaryStat {
  label: string
  value: string
}

/**
 * 全体確認のカード1枚。データ取得はせず、見た目だけを持つ。
 * 取得は部門ごとのカードコンポーネントが各自で行う。
 */
export function SummaryCard({
  title,
  stats,
  openTab,
}: {
  title: string
  stats: SummaryStat[]
  openTab: TabKey
}) {
  return (
    <div className="flex w-72 flex-col gap-3 rounded-lg border border-black/15 p-4 dark:border-white/20">
      <p className="text-xl font-bold">{title}</p>
      <dl className="flex flex-col gap-1">
        {stats.map((stat) => (
          <div key={stat.label} className="flex justify-between text-lg">
            <dt>{stat.label}</dt>
            <dd className="tabular-nums">{stat.value}</dd>
          </div>
        ))}
      </dl>
      <Link
        href={`/?dept=${openTab}`}
        className="flex min-h-14 items-center justify-center rounded-lg bg-black/5 text-lg hover:bg-black/10 dark:bg-white/10 dark:hover:bg-white/20"
      >
        {title}を開く
      </Link>
    </div>
  )
}
