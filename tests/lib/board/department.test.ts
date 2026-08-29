import { describe, it, expect } from 'vitest'
import {
  resolveTabKey,
  departmentOfTab,
  tabLabel,
  TAB_KEYS,
} from '@/lib/board/department'

describe('resolveTabKey', () => {
  it('未指定のときは土木タブになる', () => {
    expect(resolveTabKey(undefined)).toBe('doboku')
  })

  it('既知のキーはそのまま通す', () => {
    expect(resolveTabKey('unyu')).toBe('unyu')
    expect(resolveTabKey('office')).toBe('office')
    expect(resolveTabKey('summary')).toBe('summary')
  })

  it('未知の値は土木タブに落とす', () => {
    expect(resolveTabKey('存在しない部門')).toBe('doboku')
  })

  it('同じキーが複数回指定された場合は最初の値を見る', () => {
    // ?dept=unyu&dept=office のように来ると searchParams は配列になる
    expect(resolveTabKey(['unyu', 'office'])).toBe('unyu')
  })

  it('空配列は土木タブに落とす', () => {
    expect(resolveTabKey([])).toBe('doboku')
  })
})

describe('departmentOfTab', () => {
  it('部門タブは対応する所属を返す', () => {
    expect(departmentOfTab('doboku')).toBe('土木')
    expect(departmentOfTab('unyu')).toBe('運輸')
    expect(departmentOfTab('office')).toBe('事務')
  })

  it('全体確認は特定の部門を持たない', () => {
    expect(departmentOfTab('summary')).toBeNull()
  })
})

describe('tabLabel', () => {
  it('画面に出す日本語のラベルを返す', () => {
    expect(TAB_KEYS.map(tabLabel)).toEqual(['土木', '運輸', '事務', '全体確認'])
  })
})
