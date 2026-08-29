import type { BoardDepartment } from '@/lib/board/department'
import { Suspense } from 'react'
import { CollapsibleBoard } from './collapsible-board'
import { SiteGroupList } from './site-group-list'
import { UnassignedStaffGroup } from './unassigned-staff-group'
import { RestingStaffGroup } from './resting-staff-group'
import { VehicleSummaryBar } from './vehicle-summary-bar'
import { IdleVehicleGroup } from './idle-vehicle-group'
import { VehicleStatusGroup } from './vehicle-status-group'

const VEHICLE_STATUSES = ['整備', '車検', '故障', '使用停止'] as const

export function DepartmentBoard({ department }: { department: BoardDepartment }) {
  return (
    <section className="flex flex-col gap-4">
      <h2 className="text-2xl font-bold">{department}部門</h2>

      {department === '運輸' ? (
        <Suspense fallback={<p>車両集計を読み込み中...</p>}>
          <VehicleSummaryBar />
        </Suspense>
      ) : null}

      <CollapsibleBoard>
        <Suspense fallback={<p>配置枠を読み込み中...</p>}>
          <SiteGroupList department={department} />
        </Suspense>

        <Suspense fallback={<p>現場未定を読み込み中...</p>}>
          <UnassignedStaffGroup department={department} />
        </Suspense>

        {department === '運輸' ? (
          <>
            <Suspense fallback={<p>空車を読み込み中...</p>}>
              <IdleVehicleGroup />
            </Suspense>
            {VEHICLE_STATUSES.map((status) => (
              <Suspense key={status} fallback={<p>{status}を読み込み中...</p>}>
                <VehicleStatusGroup status={status} />
              </Suspense>
            ))}
          </>
        ) : null}

        <Suspense fallback={<p>休みを読み込み中...</p>}>
          <RestingStaffGroup department={department} />
        </Suspense>
      </CollapsibleBoard>
    </section>
  )
}
