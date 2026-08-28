// legacy/webapp/seed.js の実データ(社員・車両・取引先)を、新スキーマに変換して
// Supabaseへ投入するスクリプト。
//
// 実行方法: node scripts/seed-master-data.mjs
//
// 冪等性: 行単位で判定する。sites/vehicles は名前・車番が既に登録済みならスキップし、
// staff は (氏名, 部門) の組が既に登録済みならスキップする。何度実行しても
// 未登録のものだけが追加される。
// 当日の配置状態(placement_slots/staff_placements/vehicle_placements/
// attendance_events)は投入しない。マスタデータのみ。

import { createClient } from '@supabase/supabase-js'
import { config } from 'dotenv'

config({ path: '.env.local' })

const url = process.env.NEXT_PUBLIC_SUPABASE_URL
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY

if (!url || !serviceRoleKey) {
  console.error('NEXT_PUBLIC_SUPABASE_URLとSUPABASE_SERVICE_ROLE_KEYが必要です(.env.local)')
  process.exit(1)
}

const supabase = createClient(url, serviceRoleKey)

// ---- 元データ(legacy/webapp/seed.jsより) ----

const staffSeed = [
  { name: '黒瀬大祐', department: 'doboku', normalVehicleId: null, order: 1 },
  { name: '村田広実', department: 'doboku', normalVehicleId: null, order: 2 },
  { name: '垣﨑和幸', department: 'doboku', normalVehicleId: null, order: 3 },
  { name: '小野一也', department: 'doboku', normalVehicleId: null, order: 4 },
  { name: '桒野修平', department: 'doboku', normalVehicleId: null, order: 5 },
  { name: '川脇諒', department: 'doboku', normalVehicleId: null, order: 6 },
  { name: '黒瀬裕大観', department: 'doboku', normalVehicleId: null, order: 7 },
  { name: '黒瀬剛', department: 'doboku', normalVehicleId: null, order: 8 },
  { name: '水口経光', department: 'doboku', normalVehicleId: null, order: 9 },
  { name: '渡邊啓一', department: 'doboku', normalVehicleId: null, order: 10 },
  { name: '秋山英行', department: 'doboku', normalVehicleId: null, order: 11 },
  { name: '森元義紀', department: 'unyu', normalVehicleId: 'v_1', order: 1 },
  { name: '黒瀬優貴', department: 'unyu', normalVehicleId: 'v_2', order: 2 },
  { name: '荒瀬弘章', department: 'unyu', normalVehicleId: 'v_3', order: 3 },
  { name: '笹林武弘', department: 'unyu', normalVehicleId: 'v_4', order: 4 },
  { name: '原田隆幸', department: 'unyu', normalVehicleId: 'v_5', order: 5 },
  { name: '松本健太郎', department: 'unyu', normalVehicleId: 'v_6', order: 6 },
  { name: '恵良誠', department: 'unyu', normalVehicleId: 'v_7', order: 7 },
  { name: '木戸伸也', department: 'unyu', normalVehicleId: 'v_8', order: 8 },
  { name: '安達利博', department: 'unyu', normalVehicleId: 'v_9', order: 9 },
  { name: '池田賢司', department: 'unyu', normalVehicleId: 'v_10', order: 10 },
  { name: '杉尾浩志', department: 'unyu', normalVehicleId: 'v_11', order: 11 },
  { name: '網分直臣', department: 'unyu', normalVehicleId: 'v_12', order: 12 },
  { name: '黒瀬隆', department: 'unyu', normalVehicleId: 'v_13', order: 13 },
  { name: '三浦孝', department: 'unyu', normalVehicleId: 'v_14', order: 14 },
  { name: '長野進', department: 'unyu', normalVehicleId: 'v_15', order: 15 },
  { name: '土屋博正', department: 'unyu', normalVehicleId: 'v_16', order: 16 },
  { name: '木本福介', department: 'unyu', normalVehicleId: 'v_17', order: 17 },
  { name: '大迫博起', department: 'unyu', normalVehicleId: 'v_18', order: 18 },
  { name: '冨永浩', department: 'unyu', normalVehicleId: 'v_19', order: 19 },
  { name: '栢原勲', department: 'unyu', normalVehicleId: 'v_20', order: 20 },
  { name: '黒瀬とも美', department: 'office', normalVehicleId: null, order: 1 },
  { name: '山内舞', department: 'office', normalVehicleId: null, order: 2 },
  { name: '江川愛梨', department: 'office', normalVehicleId: null, order: 3 },
  { name: '谷口扶美代', department: 'office', normalVehicleId: null, order: 4 },
]

const vehiclesSeed = [
  { legacyId: 'v_1', displayName: '10tダンプ1', vehicleNumber: '1', vehicleType: '10tダンプ', order: 1 },
  { legacyId: 'v_2', displayName: '10tダンプ2', vehicleNumber: '2', vehicleType: '10tダンプ', order: 2 },
  { legacyId: 'v_3', displayName: '10tダンプ3', vehicleNumber: '3', vehicleType: '10tダンプ', order: 3 },
  { legacyId: 'v_4', displayName: '10tダンプ4', vehicleNumber: '4', vehicleType: '10tダンプ', order: 4 },
  { legacyId: 'v_5', displayName: '10tダンプ5', vehicleNumber: '5', vehicleType: '10tダンプ', order: 5 },
  { legacyId: 'v_6', displayName: '10tダンプ6', vehicleNumber: '6', vehicleType: '10tダンプ', order: 6 },
  { legacyId: 'v_7', displayName: '10tダンプ7', vehicleNumber: '7', vehicleType: '10tダンプ', order: 7 },
  { legacyId: 'v_8', displayName: '10tダンプ8', vehicleNumber: '8', vehicleType: '10tダンプ', order: 8 },
  { legacyId: 'v_9', displayName: '10tダンプ9', vehicleNumber: '9', vehicleType: '10tダンプ', order: 9 },
  { legacyId: 'v_10', displayName: '10tダンプ10', vehicleNumber: '10', vehicleType: '10tダンプ', order: 10 },
  { legacyId: 'v_11', displayName: '10tダンプ11', vehicleNumber: '11', vehicleType: '10tダンプ', order: 11 },
  { legacyId: 'v_12', displayName: '10tダンプ12', vehicleNumber: '12', vehicleType: '10tダンプ', order: 12 },
  { legacyId: 'v_13', displayName: '10tダンプ13', vehicleNumber: '13', vehicleType: '10tダンプ', order: 13 },
  { legacyId: 'v_14', displayName: '10tダンプ14', vehicleNumber: '14', vehicleType: '10tダンプ', order: 14 },
  { legacyId: 'v_15', displayName: '10tダンプ15', vehicleNumber: '15', vehicleType: '10tダンプ', order: 15 },
  { legacyId: 'v_16', displayName: '10tダンプ16', vehicleNumber: '16', vehicleType: '10tダンプ', order: 16 },
  { legacyId: 'v_17', displayName: '10tダンプ17', vehicleNumber: '17', vehicleType: '10tダンプ', order: 17 },
  { legacyId: 'v_18', displayName: '10tダンプ18', vehicleNumber: '18', vehicleType: '10tダンプ', order: 18 },
  { legacyId: 'v_19', displayName: '10tダンプ19', vehicleNumber: '19', vehicleType: '10tダンプ', order: 19 },
  { legacyId: 'v_20', displayName: '4tダンプ3439', vehicleNumber: '3439', vehicleType: '4tダンプ', order: 20 },
]

const sitesSeed = [
  { name: '本社', furigana: 'ホンシャ', category: 'common', order: 1 },
  { name: 'RK・KAWATA', furigana: 'アールケー・カワタ', category: 'unyu', order: 2 },
  { name: '㈱青木商店', furigana: 'アオキショウテン', category: 'unyu', order: 3 },
  { name: '㈱淺沼組', furigana: 'アサヌマグミ', category: 'unyu', order: 4 },
  { name: '㈱一伸', furigana: 'イッシン', category: 'unyu', order: 5 },
  { name: '板橋産業', furigana: 'イタバシサンギョウ', category: 'unyu', order: 6 },
  { name: '㈱イワシタ舗道', furigana: 'イワシタホドウ', category: 'unyu', order: 7 },
  { name: '永順産業㈱', furigana: 'エイジュンサンギョウ', category: 'unyu', order: 8 },
  { name: '㈱エトウ', furigana: 'エトウ', category: 'unyu', order: 9 },
  { name: '㈱大島組', furigana: 'オオシマグミ', category: 'unyu', order: 10 },
  { name: '㈱大森工業', furigana: 'オオモリコウギョウ', category: 'unyu', order: 11 },
  { name: '㈱大山組', furigana: 'オオヤマグミ', category: 'unyu', order: 12 },
  { name: '㈱小田組', furigana: 'オダグミ', category: 'unyu', order: 13 },
  { name: 'カイダ建設㈱', furigana: 'カイダケンセツ', category: 'unyu', order: 14 },
  { name: '金子建設興業㈲', furigana: 'カネコケンセツコウギョウ', category: 'unyu', order: 15 },
  { name: '川越建設㈱', furigana: 'カワゴエケンセツ', category: 'unyu', order: 16 },
  { name: '木内産業運輸㈱', furigana: 'キウチサンギョウウンユ', category: 'unyu', order: 17 },
  { name: '㈲北九州環境サポート', furigana: 'キタキュウシュウカンキョウサポート', category: 'unyu', order: 18 },
  { name: '協和建設㈱', furigana: 'キョウワケンセツ', category: 'unyu', order: 19 },
  { name: '㈲享和工業', furigana: 'キョウワコウギョウ', category: 'unyu', order: 20 },
  { name: '㈱久保建設', furigana: 'クボケンセツ', category: 'unyu', order: 21 },
  { name: '晃永工業㈲', furigana: 'コウエイコウギョウ', category: 'unyu', order: 22 },
  { name: '晃永工業㈲ 4t車', furigana: 'コウエイコウギョウ4トンシャ', category: 'unyu', order: 23 },
  { name: '㈱高信産業', furigana: 'コウシンサンギョウ', category: 'unyu', order: 24 },
  { name: '興和道路㈱', furigana: 'コウワドウロ', category: 'unyu', order: 25 },
  { name: '興和道路㈱ 4t車', furigana: 'コウワドウロ4トンシャ', category: 'unyu', order: 26 },
  { name: '小西建設興業㈱', furigana: 'コニシケンセツコウギョウ', category: 'unyu', order: 27 },
  { name: '小林建設㈱', furigana: 'コバヤシケンセツ', category: 'unyu', order: 28 },
  { name: '坂口組', furigana: 'サカグチグミ', category: 'unyu', order: 29 },
  { name: '三共建設㈱合材工場', furigana: 'サンキョウケンセツゴウザイコウジョウ', category: 'unyu', order: 30 },
  { name: '㈲三建建設', furigana: 'サンケンケンセツ', category: 'unyu', order: 31 },
  { name: '㈱塩月工業', furigana: 'シオヅキコウギョウ', category: 'unyu', order: 32 },
  { name: '㈱スズキ', furigana: 'スズキ', category: 'unyu', order: 33 },
  { name: '㈱大新', furigana: 'ダイシン', category: 'unyu', order: 34 },
  { name: '大成ロテック㈱', furigana: 'タイセイロテック', category: 'unyu', order: 35 },
  { name: '㈱高瀬組', furigana: 'タカセグミ', category: 'unyu', order: 36 },
  { name: '竹本産業㈲', furigana: 'タケモトサンギョウ', category: 'unyu', order: 37 },
  { name: '㈲東洋開発', furigana: 'トウヨウカイハツ', category: 'unyu', order: 38 },
  { name: '㈱東陽建工', furigana: 'トウヨウケンコウ', category: 'unyu', order: 39 },
  { name: '㈲永井運輸', furigana: 'ナガイウンユ', category: 'unyu', order: 40 },
  { name: '㈱永津建設', furigana: 'ナガツケンセツ', category: 'unyu', order: 41 },
  { name: '中村建設', furigana: 'ナカムラケンセツ', category: 'unyu', order: 42 },
  { name: '中村工業㈱', furigana: 'ナカムラコウギョウ', category: 'unyu', order: 43 },
  { name: '中本重機㈱', furigana: 'ナカモトジュウキ', category: 'unyu', order: 44 },
  { name: '㈱西村砕石大谷工場', furigana: 'ニシムラサイセキオオタニコウジョウ', category: 'unyu', order: 45 },
  { name: '㈲西村組', furigana: 'ニシムラグミ', category: 'unyu', order: 46 },
  { name: '日本道路㈱福岡合材センター', furigana: 'ニホンドウロフクオカゴウザイセンター', category: 'unyu', order: 47 },
  { name: '日本道路㈱福岡合材センター 4t車', furigana: 'ニホンドウロフクオカゴウザイセンター4トンシャ', category: 'unyu', order: 48 },
  { name: '㈱日本物流サービス', furigana: 'ニホンブツリュウサービス', category: 'unyu', order: 49 },
  { name: '梅光産業㈱', furigana: 'ウメバヤシサンギョウ', category: 'unyu', order: 50 },
  { name: '㈱早川建設', furigana: 'ハヤカワケンセツ', category: 'unyu', order: 51 },
  { name: '㈱PIT', furigana: 'ピット', category: 'unyu', order: 52 },
  { name: '㈱PIT 4t車', furigana: 'ピット4トンシャ', category: 'unyu', order: 53 },
  { name: '㈱俵口建設', furigana: 'ヒョウグチケンセツ', category: 'unyu', order: 54 },
  { name: '㈱俵口建設 4t車', furigana: 'ヒョウグチケンセツ4トンシャ', category: 'unyu', order: 55 },
  { name: '㈱フェアロード', furigana: 'フェアロード', category: 'unyu', order: 56 },
  { name: '㈱フェアロード 4t車', furigana: 'フェアロード4トンシャ', category: 'unyu', order: 57 },
  { name: '㈱福岡重機センター', furigana: 'フクオカジュウキセンター', category: 'unyu', order: 58 },
  { name: '福山総合建設㈱', furigana: 'フクヤマソウゴウケンセツ', category: 'unyu', order: 59 },
  { name: '藤木建設㈱', furigana: 'フジキケンセツ', category: 'unyu', order: 60 },
  { name: '㈱フジタ建設', furigana: 'フジタケンセツ', category: 'unyu', order: 61 },
  { name: '藤田農園', furigana: 'フジタノウエン', category: 'unyu', order: 62 },
  { name: '増田運送㈲', furigana: 'マスダウンソウ', category: 'unyu', order: 63 },
  { name: '㈲松尾建設工業', furigana: 'マツオケンセツコウギョウ', category: 'unyu', order: 64 },
  { name: '㈱松原土木', furigana: 'マツバラドボク', category: 'unyu', order: 65 },
  { name: '㈲松本技建', furigana: 'マツモトギケン', category: 'unyu', order: 66 },
  { name: '宮﨑・ヤナギJV', furigana: 'ミヤザキ・ヤナギジェイブイ', category: 'unyu', order: 67 },
  { name: '㈱松尾組', furigana: 'マツオグミ', category: 'unyu', order: 68 },
  { name: '㈱松尾道路', furigana: 'マツオドウロ', category: 'unyu', order: 69 },
  { name: '㈱宮﨑組', furigana: 'ミヤザキグミ', category: 'unyu', order: 70 },
  { name: '㈱宮本組', furigana: 'ミヤモトグミ', category: 'unyu', order: 71 },
  { name: '㈱宮本舗道工業', furigana: 'ミヤモトホドウコウギョウ', category: 'unyu', order: 72 },
  { name: '㈱八幡道路', furigana: 'ヤハタドウロ', category: 'unyu', order: 73 },
  { name: '㈱山賀', furigana: 'ヤマガ', category: 'unyu', order: 74 },
  { name: '㈱山住工業', furigana: 'ヤマズミコウギョウ', category: 'unyu', order: 75 },
  { name: '㈱山瀬組', furigana: 'ヤマセグミ', category: 'unyu', order: 76 },
  { name: '㈲山田建設興業', furigana: 'ヤマダケンセツコウギョウ', category: 'unyu', order: 77 },
  { name: '㈲山田建設興業 フェアロード', furigana: 'ヤマダケンセツコウギョウフェアロード', category: 'unyu', order: 78 },
  { name: '㈲山田建設興業 4t車', furigana: 'ヤマダケンセツコウギョウ4トンシャ', category: 'unyu', order: 79 },
  { name: '㈱友和建設', furigana: 'ユウワケンセツ', category: 'unyu', order: 80 },
  { name: '㈱友和建設 4t車', furigana: 'ユウワケンセツ4トンシャ', category: 'unyu', order: 81 },
  { name: '㈲ヨシアキ建設', furigana: 'ヨシアキケンセツ', category: 'unyu', order: 82 },
  { name: 'ローカルワーカー㈱', furigana: 'ローカルワーカー', category: 'unyu', order: 83 },
  { name: '浅沼・有田JV', furigana: 'アサヌマ・アリタジェイブイ', category: 'unyu', order: 84 },
  { name: '鹿島道路㈱', furigana: 'カジマドウロ', category: 'unyu', order: 85 },
  { name: 'YAMAZAKI', furigana: 'ヤマザキ', category: 'unyu', order: 86 },
  { name: '㈱山口舗道', furigana: 'ヤマグチホドウ', category: 'unyu', order: 87 },
]

const departmentMap = { doboku: '土木', unyu: '運輸', office: '事務' }
const categoryMap = { common: '共通', unyu: '運輸' }

async function main() {
  // --- sites: 名前が未登録のものだけ入れる ---
  const { data: existingSites, error: sitesFetchError } = await supabase.from('sites').select('name')
  if (sitesFetchError) throw new Error(`sites取得に失敗: ${sitesFetchError.message}`)
  const knownSiteNames = new Set((existingSites ?? []).map((s) => s.name))
  const newSites = sitesSeed.filter((s) => !knownSiteNames.has(s.name))

  if (newSites.length > 0) {
    console.log(`sitesを${newSites.length}件投入中...`)
    const { error } = await supabase.from('sites').insert(
      newSites.map((s) => ({
        name: s.name,
        furigana: s.furigana,
        category: categoryMap[s.category],
        display_order: s.order,
      })),
    )
    if (error) throw new Error(`sites投入に失敗: ${error.message}`)
  }

  // --- vehicles: 車番が未登録のものだけ入れる ---
  const { data: existingVehicles, error: vehiclesFetchError } = await supabase
    .from('vehicles')
    .select('vehicle_number')
  if (vehiclesFetchError) throw new Error(`vehicles取得に失敗: ${vehiclesFetchError.message}`)
  const knownVehicleNumbers = new Set((existingVehicles ?? []).map((v) => v.vehicle_number))
  const newVehicles = vehiclesSeed.filter((v) => !knownVehicleNumbers.has(v.vehicleNumber))

  if (newVehicles.length > 0) {
    console.log(`vehiclesを${newVehicles.length}件投入中...`)
    const { error } = await supabase.from('vehicles').insert(
      newVehicles.map((v) => ({
        display_name: v.displayName,
        vehicle_number: v.vehicleNumber,
        vehicle_type: v.vehicleType,
        display_order: v.order,
      })),
    )
    if (error) throw new Error(`vehicles投入に失敗: ${error.message}`)
  }

  // --- staff: (氏名, 部門) が未登録のものだけ入れる ---
  // 通常ダンプの紐付けに車両IDが要るため、車両を入れ終わってから引き直す。
  const { data: allVehicles, error: refetchVehiclesError } = await supabase
    .from('vehicles')
    .select('id, vehicle_number')
  if (refetchVehiclesError) throw new Error(`vehicles再取得に失敗: ${refetchVehiclesError.message}`)

  const vehicleIdByNumber = new Map(allVehicles.map((v) => [v.vehicle_number, v.id]))
  const vehicleNumberByLegacyId = new Map(vehiclesSeed.map((v) => [v.legacyId, v.vehicleNumber]))

  const { data: existingStaff, error: staffFetchError } = await supabase
    .from('staff')
    .select('name, department')
  if (staffFetchError) throw new Error(`staff取得に失敗: ${staffFetchError.message}`)
  const knownStaff = new Set((existingStaff ?? []).map((s) => `${s.name} ${s.department}`))
  const newStaff = staffSeed.filter(
    (s) => !knownStaff.has(`${s.name} ${departmentMap[s.department]}`),
  )

  if (newStaff.length > 0) {
    console.log(`staffを${newStaff.length}件投入中...`)
    const { error } = await supabase.from('staff').insert(
      newStaff.map((s) => {
        const vehicleNumber = s.normalVehicleId
          ? vehicleNumberByLegacyId.get(s.normalVehicleId)
          : null
        const normalVehicleId = vehicleNumber ? vehicleIdByNumber.get(vehicleNumber) : null
        return {
          name: s.name,
          department: departmentMap[s.department],
          normal_vehicle_id: normalVehicleId ?? null,
          display_order: s.order,
        }
      }),
    )
    if (error) throw new Error(`staff投入に失敗: ${error.message}`)
  }

  console.log(
    `完了: 新規投入 staff ${newStaff.length}件 / vehicles ${newVehicles.length}件 / sites ${newSites.length}件`,
  )
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
