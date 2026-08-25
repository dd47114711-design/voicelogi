import { ClockHeader } from '@/components/board/clock-header'
import { RealtimeBoardWatcher } from '@/components/board/realtime-board-watcher'
import { DepartmentBoard } from '@/components/board/department-board'

// 複数端末でリアルタイム同期する盤面のため、ビルド時に静的化させず毎回サーバでレンダリングする。
// 静的化されると RealtimeBoardWatcher の router.refresh() が本番で無意味になる。
export const dynamic = 'force-dynamic'

export default function BoardPage() {
  return (
    <main className="flex flex-col gap-8 p-4">
      <ClockHeader />
      <RealtimeBoardWatcher />
      <DepartmentBoard department="土木" />
      <DepartmentBoard department="運輸" />
    </main>
  )
}
