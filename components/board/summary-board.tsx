import { Suspense } from 'react'
import { SummaryDobokuCard } from './summary-doboku-card'
import { SummaryUnyuCard } from './summary-unyu-card'
import { SummaryOfficeCard } from './summary-office-card'

/**
 * 全体確認タブ。
 * カード1枚 = 1 Suspense 境界にしている。運輸カードは車両6種の集計を伴って
 * 最も重く、束ねると土木・事務のカード表示まで止まってしまうため。
 */
export function SummaryBoard() {
  return (
    <section className="flex flex-col gap-4">
      <h2 className="text-2xl font-bold">全体確認</h2>
      <div className="flex flex-wrap items-start gap-4">
        <Suspense fallback={<p>土木の集計を読み込み中...</p>}>
          <SummaryDobokuCard />
        </Suspense>
        <Suspense fallback={<p>運輸の集計を読み込み中...</p>}>
          <SummaryUnyuCard />
        </Suspense>
        <Suspense fallback={<p>事務の集計を読み込み中...</p>}>
          <SummaryOfficeCard />
        </Suspense>
      </div>
    </section>
  )
}
