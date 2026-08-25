export type VehicleStatus = '使用可能' | '整備' | '車検' | '故障' | '使用停止'
export type VehicleCategory = '使用中' | '空車' | '整備' | '車検' | '故障' | '使用停止'

export function classifyVehicle(params: {
  status: VehicleStatus
  isDriven: boolean
  isParkedAtSite: boolean
}): VehicleCategory {
  if (params.status !== '使用可能') {
    return params.status
  }
  return params.isDriven || params.isParkedAtSite ? '使用中' : '空車'
}
