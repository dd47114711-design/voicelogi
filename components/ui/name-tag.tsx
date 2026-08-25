import { VerticalText } from './vertical-text'
import type { AttendanceStatus } from '@/lib/board/attendance-status'

export function NameTag({ name, status }: { name: string; status: AttendanceStatus }) {
  const colorClass =
    status === 'present'
      ? 'bg-white text-black border-black'
      : 'bg-red-600 text-white border-red-800'

  return (
    <div className={`flex h-32 w-10 items-center justify-center rounded border-2 ${colorClass}`}>
      <VerticalText text={name} />
    </div>
  )
}
