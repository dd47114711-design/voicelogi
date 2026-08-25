import { describe, expect, it } from 'vitest'
import { circledNumber } from '@/lib/board/circled-number'

describe('circledNumber', () => {
  it('1から20までは丸数字を返す', () => {
    expect(circledNumber(1)).toBe('①')
    expect(circledNumber(3)).toBe('③')
    expect(circledNumber(20)).toBe('⑳')
  })

  it('21以上は括弧付き数字にフォールバックする', () => {
    expect(circledNumber(21)).toBe('(21)')
  })
})
