import { ClockHeader } from '@/components/board/clock-header'
import { RealtimeBoardWatcher } from '@/components/board/realtime-board-watcher'
import { DepartmentBoard } from '@/components/board/department-board'

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
