import { config } from 'dotenv'
import { createClient, type SupabaseClient } from '@supabase/supabase-js'
import type { Database } from '@/lib/supabase/database.types'

config({ path: '.env.local' })

/**
 * テスト全体の実行前に1回だけ走る掃除処理。
 *
 * このリポジトリのDBテストは（Dockerが使えないため）ローカルのSupabaseではなく
 * 実際のリモートプロジェクトに接続する。テストが途中でクラッシュすると afterAll の
 * 後始末が走らず、`TEST_` で始まる行が本番プロジェクトに残り続けてしまう。
 * ここで前回の残骸をまとめて消し、毎回きれいな状態から始められるようにする。
 *
 * 消すのは名称が `TEST_` で始まる行だけ。実データには触れない。
 */

/** 掃除対象のテーブルと、`TEST_` 判定に使う列。子テーブルから先に消す順で並べる。 */
const SWEEP_TARGETS = [
  { table: 'sites', column: 'name' },
  { table: 'staff', column: 'name' },
  { table: 'vehicles', column: 'display_name' },
] as const satisfies ReadonlyArray<{ table: keyof Database['public']['Tables']; column: string }>

async function sweepStaffDependents(admin: SupabaseClient<Database>): Promise<void> {
  // staff を消す前に、staff を参照している行を先に消す必要がある。
  const { data: testStaff, error } = await admin.from('staff').select('id').like('name', 'TEST_%')

  if (error) {
    throw new Error(`テスト残骸の調査に失敗しました(staff): ${error.message}`)
  }
  if (!testStaff || testStaff.length === 0) return

  const staffIds = testStaff.map((row) => row.id)

  for (const table of ['staff_placements', 'attendance_events'] as const) {
    const { error: deleteError } = await admin.from(table).delete().in('staff_id', staffIds)
    if (deleteError) {
      throw new Error(`テスト残骸の削除に失敗しました(${table}): ${deleteError.message}`)
    }
  }
}

async function sweepVehicleDependents(admin: SupabaseClient<Database>): Promise<void> {
  // vehicles を消す前に、vehicles を参照している行を先に始末する。
  const { data: testVehicles, error } = await admin
    .from('vehicles')
    .select('id')
    .like('display_name', 'TEST_%')

  if (error) {
    throw new Error(`テスト残骸の調査に失敗しました(vehicles): ${error.message}`)
  }
  if (!testVehicles || testVehicles.length === 0) return

  const vehicleIds = testVehicles.map((row) => row.id)

  const { error: placementError } = await admin
    .from('vehicle_placements')
    .delete()
    .in('vehicle_id', vehicleIds)
  if (placementError) {
    throw new Error(`テスト残骸の削除に失敗しました(vehicle_placements): ${placementError.message}`)
  }

  // 実データの人員を消さないよう、参照だけ外す。
  const { error: assignedError } = await admin
    .from('staff_placements')
    .update({ assigned_vehicle_id: null })
    .in('assigned_vehicle_id', vehicleIds)
  if (assignedError) {
    throw new Error(`テスト残骸の参照解除に失敗しました(staff_placements): ${assignedError.message}`)
  }

  const { error: normalError } = await admin
    .from('staff')
    .update({ normal_vehicle_id: null })
    .in('normal_vehicle_id', vehicleIds)
  if (normalError) {
    throw new Error(`テスト残骸の参照解除に失敗しました(staff): ${normalError.message}`)
  }
}

async function sweepSiteDependents(admin: SupabaseClient<Database>): Promise<void> {
  // sites を消す前に、その現場にぶら下がる配置枠（と配置枠を参照する行）を先に消す。
  const { data: testSites, error } = await admin.from('sites').select('id').like('name', 'TEST_%')

  if (error) {
    throw new Error(`テスト残骸の調査に失敗しました(sites): ${error.message}`)
  }
  if (!testSites || testSites.length === 0) return

  const { data: slots, error: slotError } = await admin
    .from('placement_slots')
    .select('id')
    .in(
      'site_id',
      testSites.map((row) => row.id),
    )

  if (slotError) {
    throw new Error(`テスト残骸の調査に失敗しました(placement_slots): ${slotError.message}`)
  }
  if (!slots || slots.length === 0) return

  const slotIds = slots.map((row) => row.id)

  // 配置枠を参照している行は、行ごと消すのではなく参照を外す（実データの人員・車両を消さないため）。
  for (const table of ['staff_placements', 'vehicle_placements'] as const) {
    const { error: detachError } = await admin
      .from(table)
      .update({ slot_id: null })
      .in('slot_id', slotIds)
    if (detachError) {
      throw new Error(`テスト残骸の参照解除に失敗しました(${table}): ${detachError.message}`)
    }
  }

  const { error: deleteError } = await admin.from('placement_slots').delete().in('id', slotIds)
  if (deleteError) {
    throw new Error(`テスト残骸の削除に失敗しました(placement_slots): ${deleteError.message}`)
  }
}

export default async function setup(): Promise<void> {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY

  if (!url || !serviceRoleKey) {
    throw new Error(
      'テスト残骸の掃除にはNEXT_PUBLIC_SUPABASE_URLとSUPABASE_SERVICE_ROLE_KEYが必要です。.env.localを確認してください',
    )
  }

  const admin = createClient<Database>(url, serviceRoleKey)

  await sweepStaffDependents(admin)
  await sweepSiteDependents(admin)
  await sweepVehicleDependents(admin)

  for (const { table, column } of SWEEP_TARGETS) {
    const { error } = await admin.from(table).delete().like(column, 'TEST_%')
    if (error) {
      throw new Error(`テスト残骸の削除に失敗しました(${table}): ${error.message}`)
    }
  }
}
