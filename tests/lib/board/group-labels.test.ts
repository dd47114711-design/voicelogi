import { describe, expect, it } from 'vitest'
import { assignGroupLabels, type RawSlot } from '@/lib/board/group-labels'

function slot(overrides: Partial<RawSlot>): RawSlot {
  return {
    slotId: 'slot-default',
    siteId: 'site-a',
    siteName: '永順',
    department: '運輸',
    openedAt: '2026-01-01T00:00:00Z',
    endedAt: null,
    ...overrides,
  }
}

describe('assignGroupLabels', () => {
  it('同じ現場・同じ部門の配置枠に開設順で丸数字を振る', () => {
    const slots = [
      slot({ slotId: 's2', openedAt: '2026-01-02T00:00:00Z' }),
      slot({ slotId: 's1', openedAt: '2026-01-01T00:00:00Z' }),
    ]

    const labeled = assignGroupLabels(slots)

    expect(labeled.find((s) => s.slotId === 's1')?.label).toBe('永順①')
    expect(labeled.find((s) => s.slotId === 's2')?.label).toBe('永順②')
  })

  it('部門が違えば別カウントになる', () => {
    const slots = [
      slot({ slotId: 's1', department: '運輸', openedAt: '2026-01-01T00:00:00Z' }),
      slot({ slotId: 's2', department: '土木', openedAt: '2026-01-02T00:00:00Z' }),
    ]

    const labeled = assignGroupLabels(slots)

    expect(labeled.find((s) => s.slotId === 's1')?.label).toBe('永順①')
    expect(labeled.find((s) => s.slotId === 's2')?.label).toBe('永順①')
  })

  it('終了済みの配置枠を含めて番号を振るため、間が抜けても番号はずれない', () => {
    const slots = [
      slot({ slotId: 's1', openedAt: '2026-01-01T00:00:00Z', endedAt: '2026-01-02T00:00:00Z' }),
      slot({ slotId: 's2', openedAt: '2026-01-03T00:00:00Z', endedAt: null }),
    ]

    const labeled = assignGroupLabels(slots)

    expect(labeled.find((s) => s.slotId === 's2')?.label).toBe('永順②')
  })
})
