import { describe, expect, it } from 'vitest'
import { classifyVehicle } from '@/lib/board/vehicle-category'

describe('classifyVehicle', () => {
  it('使用可能かつ運転されていれば使用中', () => {
    expect(classifyVehicle({ status: '使用可能', isDriven: true, isParkedAtSite: false })).toBe('使用中')
  })

  it('使用可能かつ現場に無人駐車されていれば使用中', () => {
    expect(classifyVehicle({ status: '使用可能', isDriven: false, isParkedAtSite: true })).toBe('使用中')
  })

  it('使用可能で誰も乗らず駐車もされていなければ空車', () => {
    expect(classifyVehicle({ status: '使用可能', isDriven: false, isParkedAtSite: false })).toBe('空車')
  })

  it('使用可能以外はステータスそのものを返す(運転・駐車状況に関わらず)', () => {
    expect(classifyVehicle({ status: '車検', isDriven: false, isParkedAtSite: false })).toBe('車検')
    expect(classifyVehicle({ status: '故障', isDriven: true, isParkedAtSite: false })).toBe('故障')
  })
})
