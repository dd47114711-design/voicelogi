import { ClockHeader } from '@/components/board/clock-header'
import { RealtimeBoardWatcher } from '@/components/board/realtime-board-watcher'
import { DepartmentBoard } from '@/components/board/department-board'
import { DepartmentTabBar } from '@/components/board/department-tab-bar'
import { OfficeBoard } from '@/components/board/office-board'
import { SummaryBoard } from '@/components/board/summary-board'
import { resolveTabKey } from '@/lib/board/department'

// 複数端末でリアルタイム同期する盤面のため、ビルド時に静的化させず毎回サーバでレンダリングする。
// 静的化されると RealtimeBoardWatcher の router.refresh() が本番で無意味になる。
export const dynamic = 'force-dynamic'

export default async function BoardPage({ searchParams }: PageProps<'/'>) {
  // Next.js 16 では searchParams が Promise。
  const params = await searchParams
  const tab = resolveTabKey(params.dept)

  return (
    <main className="flex flex-col gap-8 p-4">
      <ClockHeader />
      <RealtimeBoardWatcher />
      <DepartmentTabBar current={tab} />

      {tab === 'doboku' && <DepartmentBoard department="土木" />}
      {tab === 'unyu' && <DepartmentBoard department="運輸" />}
      {tab === 'office' && <OfficeBoard />}
      {tab === 'summary' && <SummaryBoard />}
    </main>
  )
}
