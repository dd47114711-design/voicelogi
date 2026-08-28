import type { BoardDepartment } from './department'
import { circledNumber } from './circled-number'

export interface RawSlot {
  slotId: string
  siteId: string
  siteName: string
  department: BoardDepartment
  openedAt: string
  endedAt: string | null
}

export interface LabeledSlot extends RawSlot {
  label: string
}

export function assignGroupLabels(slots: RawSlot[]): LabeledSlot[] {
  const sortedByOpenedAt = [...slots].sort(
    (a, b) => new Date(a.openedAt).getTime() - new Date(b.openedAt).getTime(),
  )

  const sequenceBySlotId = new Map<string, number>()
  const counters = new Map<string, number>()

  for (const slot of sortedByOpenedAt) {
    const key = `${slot.department}|${slot.siteId}`
    const next = (counters.get(key) ?? 0) + 1
    counters.set(key, next)
    sequenceBySlotId.set(slot.slotId, next)
  }

  return slots.map((slot) => ({
    ...slot,
    label: `${slot.siteName}${circledNumber(sequenceBySlotId.get(slot.slotId) as number)}`,
  }))
}
