/*
 * seed.js
 * ---------------------------------------------------------------
 * 動作確認用の初期データ(仮データ)。
 * 実際の社員名・車両番号・現場名が決まったら、この関数の中身を
 * 差し替えるだけで良い。差し替えても保存済みの実データは
 * (別途「保存データを消去」しない限り)上書きされない。
 *
 * データ構造:
 *   staff         : 人員マスタ + 当日の割当を1レコードにまとめたもの
 *   sites         : 現場マスタ(会社名・現場名の基本情報のみ)
 *   vehicles      : 車両マスタ
 *   dispatchGroups: 当日の配置枠(同じ現場でも複数作れる)
 *   assignments   : 配置枠内の運転手とダンプの組合せ
 */
(function (global) {

  function createSeedState() {
    return {
      version: 2,
      staff: [
        // ---- 土木部門 ----
        // 黒瀬大祐(専務)・黒瀬剛(代表取締役)は土木の現場にも入るため、
        // 通常はダンプを持たないが、必要な日だけ運輸の配車ウィザードで
        // 運転手候補として選び、運輸のダンプに乗せることができる
        // (workRolesにdumpDriverを持つため)。
        { id: 'st_1', name: '黒瀬大祐', department: 'doboku', workRoles: ['civil', 'dumpDriver'], attendance: 'absent',
          normalVehicleId: null, todayVehicleId: null, todayGroupId: null, order: 1, active: true },
        { id: 'st_2', name: '村田広実', department: 'doboku', workRoles: ['civil'], attendance: 'absent',
          normalVehicleId: null, todayVehicleId: null, todayGroupId: null, order: 2, active: true },
        { id: 'st_3', name: '垣﨑和幸', department: 'doboku', workRoles: ['civil'], attendance: 'absent',
          normalVehicleId: null, todayVehicleId: null, todayGroupId: null, order: 3, active: true },
        { id: 'st_4', name: '小野一也', department: 'doboku', workRoles: ['civil', 'dumpDriver'], attendance: 'absent',
          normalVehicleId: null, todayVehicleId: null, todayGroupId: null, order: 4, active: true },
        { id: 'st_5', name: '桒野修平', department: 'doboku', workRoles: ['civil'], attendance: 'absent',
          normalVehicleId: null, todayVehicleId: null, todayGroupId: null, order: 5, active: true },
        { id: 'st_6', name: '川脇諒', department: 'doboku', workRoles: ['civil'], attendance: 'absent',
          normalVehicleId: null, todayVehicleId: null, todayGroupId: null, order: 6, active: true },
        { id: 'st_7', name: '黒瀬裕大観', department: 'doboku', workRoles: ['civil'], attendance: 'absent',
          normalVehicleId: null, todayVehicleId: null, todayGroupId: null, order: 7, active: true },
        { id: 'st_8', name: '黒瀬剛', department: 'doboku', workRoles: ['civil', 'dumpDriver'], attendance: 'absent',
          normalVehicleId: null, todayVehicleId: null, todayGroupId: null, order: 8, active: true },
        { id: 'st_9', name: '水口経光', department: 'doboku', workRoles: ['civil'], attendance: 'absent',
          normalVehicleId: null, todayVehicleId: null, todayGroupId: null, order: 9, active: true },
        { id: 'st_30', name: '渡邊啓一', department: 'doboku', workRoles: ['civil'], attendance: 'absent',
          normalVehicleId: null, todayVehicleId: null, todayGroupId: null, order: 10, active: true },
        { id: 'st_31', name: '秋山英行', department: 'doboku', workRoles: ['civil'], attendance: 'absent',
          normalVehicleId: null, todayVehicleId: null, todayGroupId: null, order: 11, active: true },

        // ---- 運輸部門(ダンプ運転手。通常ダンプは車番と対応) ----
        { id: 'st_10', name: '森元義紀', department: 'unyu', workRoles: ['dumpDriver', 'civil'], attendance: 'absent',
          normalVehicleId: 'v_1', todayVehicleId: null, todayGroupId: null, order: 1, active: true },
        { id: 'st_11', name: '黒瀬優貴', department: 'unyu', workRoles: ['dumpDriver'], attendance: 'absent',
          normalVehicleId: 'v_2', todayVehicleId: null, todayGroupId: null, order: 2, active: true },
        { id: 'st_12', name: '荒瀬弘章', department: 'unyu', workRoles: ['dumpDriver'], attendance: 'absent',
          normalVehicleId: 'v_3', todayVehicleId: null, todayGroupId: null, order: 3, active: true },
        { id: 'st_13', name: '笹林武弘', department: 'unyu', workRoles: ['dumpDriver'], attendance: 'absent',
          normalVehicleId: 'v_4', todayVehicleId: null, todayGroupId: null, order: 4, active: true },
        { id: 'st_14', name: '原田隆幸', department: 'unyu', workRoles: ['dumpDriver'], attendance: 'absent',
          normalVehicleId: 'v_5', todayVehicleId: null, todayGroupId: null, order: 5, active: true },
        { id: 'st_15', name: '松本健太郎', department: 'unyu', workRoles: ['dumpDriver'], attendance: 'absent',
          normalVehicleId: 'v_6', todayVehicleId: null, todayGroupId: null, order: 6, active: true },
        { id: 'st_16', name: '恵良誠', department: 'unyu', workRoles: ['dumpDriver'], attendance: 'absent',
          normalVehicleId: 'v_7', todayVehicleId: null, todayGroupId: null, order: 7, active: true },
        { id: 'st_17', name: '木戸伸也', department: 'unyu', workRoles: ['dumpDriver'], attendance: 'absent',
          normalVehicleId: 'v_8', todayVehicleId: null, todayGroupId: null, order: 8, active: true },
        { id: 'st_18', name: '安達利博', department: 'unyu', workRoles: ['dumpDriver'], attendance: 'absent',
          normalVehicleId: 'v_9', todayVehicleId: null, todayGroupId: null, order: 9, active: true },
        { id: 'st_19', name: '池田賢司', department: 'unyu', workRoles: ['dumpDriver'], attendance: 'absent',
          normalVehicleId: 'v_10', todayVehicleId: null, todayGroupId: null, order: 10, active: true },
        { id: 'st_20', name: '杉尾浩志', department: 'unyu', workRoles: ['dumpDriver'], attendance: 'absent',
          normalVehicleId: 'v_11', todayVehicleId: null, todayGroupId: null, order: 11, active: true },
        { id: 'st_21', name: '網分直臣', department: 'unyu', workRoles: ['dumpDriver'], attendance: 'absent',
          normalVehicleId: 'v_12', todayVehicleId: null, todayGroupId: null, order: 12, active: true },
        // 黒瀬隆(車番13の通常運転手)は現在は会長で運転頻度が少ないため、
        // 出勤していない日は13番が「空車」に見え、他の人(土木を含む)が
        // 乗った日はその人の名前・ダンプ札に表示される。
        { id: 'st_22', name: '黒瀬隆', department: 'unyu', workRoles: ['dumpDriver'], attendance: 'absent',
          normalVehicleId: 'v_13', todayVehicleId: null, todayGroupId: null, order: 13, active: true },
        { id: 'st_23', name: '三浦孝', department: 'unyu', workRoles: ['dumpDriver'], attendance: 'absent',
          normalVehicleId: 'v_14', todayVehicleId: null, todayGroupId: null, order: 14, active: true },
        { id: 'st_24', name: '長野進', department: 'unyu', workRoles: ['dumpDriver'], attendance: 'absent',
          normalVehicleId: 'v_15', todayVehicleId: null, todayGroupId: null, order: 15, active: true },
        { id: 'st_25', name: '土屋博正', department: 'unyu', workRoles: ['dumpDriver'], attendance: 'absent',
          normalVehicleId: 'v_16', todayVehicleId: null, todayGroupId: null, order: 16, active: true },
        { id: 'st_26', name: '木本福介', department: 'unyu', workRoles: ['dumpDriver'], attendance: 'absent',
          normalVehicleId: 'v_17', todayVehicleId: null, todayGroupId: null, order: 17, active: true },
        { id: 'st_27', name: '大迫博起', department: 'unyu', workRoles: ['dumpDriver'], attendance: 'absent',
          normalVehicleId: 'v_18', todayVehicleId: null, todayGroupId: null, order: 18, active: true },
        { id: 'st_28', name: '冨永浩', department: 'unyu', workRoles: ['dumpDriver'], attendance: 'absent',
          normalVehicleId: 'v_19', todayVehicleId: null, todayGroupId: null, order: 19, active: true },
        { id: 'st_29', name: '栢原勲', department: 'unyu', workRoles: ['dumpDriver'], attendance: 'absent',
          normalVehicleId: 'v_20', todayVehicleId: null, todayGroupId: null, order: 20, active: true },

        // ---- 事務部門 ----
        { id: 'staff_office_1', name: '黒瀬とも美', department: 'office', workRoles: ['office'], attendance: 'absent',
          normalVehicleId: null, todayVehicleId: null, todayGroupId: null, order: 1, active: true },
        { id: 'staff_office_2', name: '山内舞', department: 'office', workRoles: ['office'], attendance: 'absent',
          normalVehicleId: null, todayVehicleId: null, todayGroupId: null, order: 2, active: true },
        { id: 'staff_office_3', name: '江川愛梨', department: 'office', workRoles: ['office'], attendance: 'absent',
          normalVehicleId: null, todayVehicleId: null, todayGroupId: null, order: 3, active: true },
        { id: 'staff_office_4', name: '谷口扶美代', department: 'office', workRoles: ['office'], attendance: 'absent',
          normalVehicleId: null, todayVehicleId: null, todayGroupId: null, order: 4, active: true }
      ],

      // 現場マスタ: 会社名・現場名の基本情報だけを持つ。当日の配置枠
      // (dispatchGroups)とは別のデータで、現場名だけでは人・車両を
      // グルーピングしない。
      // 運輸部門は現場名ではなく発注元の業者名を札に入れて運用しているため、
      // sitesマスタには「現場名」ではなく実際の業者名を登録する
      // (単価表エクセルより。フリガナは一部、事務員に確認して登録)。
      sites: [
        { id: 'site_1', name: '本社', furigana: 'ホンシャ', category: 'common', status: 'active', order: 1, createdAt: '2026-01-01T00:00:00.000Z', usageCount: 0 },
        { id: 'site_unyu_1', name: 'RK・KAWATA', furigana: 'アールケー・カワタ', category: 'unyu', status: 'active', order: 2, createdAt: '2026-08-03T00:00:00.000Z', usageCount: 0 },
        { id: 'site_unyu_2', name: '㈱青木商店', furigana: 'アオキショウテン', category: 'unyu', status: 'active', order: 3, createdAt: '2026-08-03T00:00:00.000Z', usageCount: 0 },
        { id: 'site_unyu_3', name: '㈱淺沼組', furigana: 'アサヌマグミ', category: 'unyu', status: 'active', order: 4, createdAt: '2026-08-03T00:00:00.000Z', usageCount: 0 },
        { id: 'site_unyu_4', name: '㈱一伸', furigana: 'イッシン', category: 'unyu', status: 'active', order: 5, createdAt: '2026-08-03T00:00:00.000Z', usageCount: 0 },
        { id: 'site_unyu_5', name: '板橋産業', furigana: 'イタバシサンギョウ', category: 'unyu', status: 'active', order: 6, createdAt: '2026-08-03T00:00:00.000Z', usageCount: 0 },
        { id: 'site_unyu_6', name: '㈱イワシタ舗道', furigana: 'イワシタホドウ', category: 'unyu', status: 'active', order: 7, createdAt: '2026-08-03T00:00:00.000Z', usageCount: 0 },
        { id: 'site_unyu_7', name: '永順産業㈱', furigana: 'エイジュンサンギョウ', category: 'unyu', status: 'active', order: 8, createdAt: '2026-08-03T00:00:00.000Z', usageCount: 0 },
        { id: 'site_unyu_8', name: '㈱エトウ', furigana: 'エトウ', category: 'unyu', status: 'active', order: 9, createdAt: '2026-08-03T00:00:00.000Z', usageCount: 0 },
        { id: 'site_unyu_9', name: '㈱大島組', furigana: 'オオシマグミ', category: 'unyu', status: 'active', order: 10, createdAt: '2026-08-03T00:00:00.000Z', usageCount: 0 },
        { id: 'site_unyu_10', name: '㈱大森工業', furigana: 'オオモリコウギョウ', category: 'unyu', status: 'active', order: 11, createdAt: '2026-08-03T00:00:00.000Z', usageCount: 0 },
        { id: 'site_unyu_11', name: '㈱大山組', furigana: 'オオヤマグミ', category: 'unyu', status: 'active', order: 12, createdAt: '2026-08-03T00:00:00.000Z', usageCount: 0 },
        { id: 'site_unyu_12', name: '㈱小田組', furigana: 'オダグミ', category: 'unyu', status: 'active', order: 13, createdAt: '2026-08-03T00:00:00.000Z', usageCount: 0 },
        { id: 'site_unyu_13', name: 'カイダ建設㈱', furigana: 'カイダケンセツ', category: 'unyu', status: 'active', order: 14, createdAt: '2026-08-03T00:00:00.000Z', usageCount: 0 },
        { id: 'site_unyu_14', name: '金子建設興業㈲', furigana: 'カネコケンセツコウギョウ', category: 'unyu', status: 'active', order: 15, createdAt: '2026-08-03T00:00:00.000Z', usageCount: 0 },
        { id: 'site_unyu_15', name: '川越建設㈱', furigana: 'カワゴエケンセツ', category: 'unyu', status: 'active', order: 16, createdAt: '2026-08-03T00:00:00.000Z', usageCount: 0 },
        { id: 'site_unyu_16', name: '木内産業運輸㈱', furigana: 'キウチサンギョウウンユ', category: 'unyu', status: 'active', order: 17, createdAt: '2026-08-03T00:00:00.000Z', usageCount: 0 },
        { id: 'site_unyu_17', name: '㈲北九州環境サポート', furigana: 'キタキュウシュウカンキョウサポート', category: 'unyu', status: 'active', order: 18, createdAt: '2026-08-03T00:00:00.000Z', usageCount: 0 },
        { id: 'site_unyu_18', name: '協和建設㈱', furigana: 'キョウワケンセツ', category: 'unyu', status: 'active', order: 19, createdAt: '2026-08-03T00:00:00.000Z', usageCount: 0 },
        { id: 'site_unyu_19', name: '㈲享和工業', furigana: 'キョウワコウギョウ', category: 'unyu', status: 'active', order: 20, createdAt: '2026-08-03T00:00:00.000Z', usageCount: 0 },
        { id: 'site_unyu_20', name: '㈱久保建設', furigana: 'クボケンセツ', category: 'unyu', status: 'active', order: 21, createdAt: '2026-08-03T00:00:00.000Z', usageCount: 0 },
        { id: 'site_unyu_21', name: '晃永工業㈲', furigana: 'コウエイコウギョウ', category: 'unyu', status: 'active', order: 22, createdAt: '2026-08-03T00:00:00.000Z', usageCount: 0 },
        { id: 'site_unyu_22', name: '晃永工業㈲ 4t車', furigana: 'コウエイコウギョウ4トンシャ', category: 'unyu', status: 'active', order: 23, createdAt: '2026-08-03T00:00:00.000Z', usageCount: 0 },
        { id: 'site_unyu_23', name: '㈱高信産業', furigana: 'コウシンサンギョウ', category: 'unyu', status: 'active', order: 24, createdAt: '2026-08-03T00:00:00.000Z', usageCount: 0 },
        { id: 'site_unyu_24', name: '興和道路㈱', furigana: 'コウワドウロ', category: 'unyu', status: 'active', order: 25, createdAt: '2026-08-03T00:00:00.000Z', usageCount: 0 },
        { id: 'site_unyu_25', name: '興和道路㈱ 4t車', furigana: 'コウワドウロ4トンシャ', category: 'unyu', status: 'active', order: 26, createdAt: '2026-08-03T00:00:00.000Z', usageCount: 0 },
        { id: 'site_unyu_26', name: '小西建設興業㈱', furigana: 'コニシケンセツコウギョウ', category: 'unyu', status: 'active', order: 27, createdAt: '2026-08-03T00:00:00.000Z', usageCount: 0 },
        { id: 'site_unyu_27', name: '小林建設㈱', furigana: 'コバヤシケンセツ', category: 'unyu', status: 'active', order: 28, createdAt: '2026-08-03T00:00:00.000Z', usageCount: 0 },
        { id: 'site_unyu_28', name: '坂口組', furigana: 'サカグチグミ', category: 'unyu', status: 'active', order: 29, createdAt: '2026-08-03T00:00:00.000Z', usageCount: 0 },
        { id: 'site_unyu_29', name: '三共建設㈱合材工場', furigana: 'サンキョウケンセツゴウザイコウジョウ', category: 'unyu', status: 'active', order: 30, createdAt: '2026-08-03T00:00:00.000Z', usageCount: 0 },
        { id: 'site_unyu_30', name: '㈲三建建設', furigana: 'サンケンケンセツ', category: 'unyu', status: 'active', order: 31, createdAt: '2026-08-03T00:00:00.000Z', usageCount: 0 },
        { id: 'site_unyu_31', name: '㈱塩月工業', furigana: 'シオヅキコウギョウ', category: 'unyu', status: 'active', order: 32, createdAt: '2026-08-03T00:00:00.000Z', usageCount: 0 },
        { id: 'site_unyu_32', name: '㈱スズキ', furigana: 'スズキ', category: 'unyu', status: 'active', order: 33, createdAt: '2026-08-03T00:00:00.000Z', usageCount: 0 },
        { id: 'site_unyu_33', name: '㈱大新', furigana: 'ダイシン', category: 'unyu', status: 'active', order: 34, createdAt: '2026-08-03T00:00:00.000Z', usageCount: 0 },
        { id: 'site_unyu_34', name: '大成ロテック㈱', furigana: 'タイセイロテック', category: 'unyu', status: 'active', order: 35, createdAt: '2026-08-03T00:00:00.000Z', usageCount: 0 },
        { id: 'site_unyu_35', name: '㈱高瀬組', furigana: 'タカセグミ', category: 'unyu', status: 'active', order: 36, createdAt: '2026-08-03T00:00:00.000Z', usageCount: 0 },
        { id: 'site_unyu_36', name: '竹本産業㈲', furigana: 'タケモトサンギョウ', category: 'unyu', status: 'active', order: 37, createdAt: '2026-08-03T00:00:00.000Z', usageCount: 0 },
        { id: 'site_unyu_37', name: '㈲東洋開発', furigana: 'トウヨウカイハツ', category: 'unyu', status: 'active', order: 38, createdAt: '2026-08-03T00:00:00.000Z', usageCount: 0 },
        { id: 'site_unyu_38', name: '㈱東陽建工', furigana: 'トウヨウケンコウ', category: 'unyu', status: 'active', order: 39, createdAt: '2026-08-03T00:00:00.000Z', usageCount: 0 },
        { id: 'site_unyu_39', name: '㈲永井運輸', furigana: 'ナガイウンユ', category: 'unyu', status: 'active', order: 40, createdAt: '2026-08-03T00:00:00.000Z', usageCount: 0 },
        { id: 'site_unyu_40', name: '㈱永津建設', furigana: 'ナガツケンセツ', category: 'unyu', status: 'active', order: 41, createdAt: '2026-08-03T00:00:00.000Z', usageCount: 0 },
        { id: 'site_unyu_41', name: '中村建設', furigana: 'ナカムラケンセツ', category: 'unyu', status: 'active', order: 42, createdAt: '2026-08-03T00:00:00.000Z', usageCount: 0 },
        { id: 'site_unyu_42', name: '中村工業㈱', furigana: 'ナカムラコウギョウ', category: 'unyu', status: 'active', order: 43, createdAt: '2026-08-03T00:00:00.000Z', usageCount: 0 },
        { id: 'site_unyu_43', name: '中本重機㈱', furigana: 'ナカモトジュウキ', category: 'unyu', status: 'active', order: 44, createdAt: '2026-08-03T00:00:00.000Z', usageCount: 0 },
        { id: 'site_unyu_44', name: '㈱西村砕石大谷工場', furigana: 'ニシムラサイセキオオタニコウジョウ', category: 'unyu', status: 'active', order: 45, createdAt: '2026-08-03T00:00:00.000Z', usageCount: 0 },
        { id: 'site_unyu_45', name: '㈲西村組', furigana: 'ニシムラグミ', category: 'unyu', status: 'active', order: 46, createdAt: '2026-08-03T00:00:00.000Z', usageCount: 0 },
        { id: 'site_unyu_46', name: '日本道路㈱福岡合材センター', furigana: 'ニホンドウロフクオカゴウザイセンター', category: 'unyu', status: 'active', order: 47, createdAt: '2026-08-03T00:00:00.000Z', usageCount: 0 },
        { id: 'site_unyu_47', name: '日本道路㈱福岡合材センター 4t車', furigana: 'ニホンドウロフクオカゴウザイセンター4トンシャ', category: 'unyu', status: 'active', order: 48, createdAt: '2026-08-03T00:00:00.000Z', usageCount: 0 },
        { id: 'site_unyu_48', name: '㈱日本物流サービス', furigana: 'ニホンブツリュウサービス', category: 'unyu', status: 'active', order: 49, createdAt: '2026-08-03T00:00:00.000Z', usageCount: 0 },
        { id: 'site_unyu_49', name: '梅光産業㈱', furigana: 'ウメバヤシサンギョウ', category: 'unyu', status: 'active', order: 50, createdAt: '2026-08-03T00:00:00.000Z', usageCount: 0 },
        { id: 'site_unyu_50', name: '㈱早川建設', furigana: 'ハヤカワケンセツ', category: 'unyu', status: 'active', order: 51, createdAt: '2026-08-03T00:00:00.000Z', usageCount: 0 },
        { id: 'site_unyu_51', name: '㈱PIT', furigana: 'ピット', category: 'unyu', status: 'active', order: 52, createdAt: '2026-08-03T00:00:00.000Z', usageCount: 0 },
        { id: 'site_unyu_52', name: '㈱PIT 4t車', furigana: 'ピット4トンシャ', category: 'unyu', status: 'active', order: 53, createdAt: '2026-08-03T00:00:00.000Z', usageCount: 0 },
        { id: 'site_unyu_53', name: '㈱俵口建設', furigana: 'ヒョウグチケンセツ', category: 'unyu', status: 'active', order: 54, createdAt: '2026-08-03T00:00:00.000Z', usageCount: 0 },
        { id: 'site_unyu_54', name: '㈱俵口建設 4t車', furigana: 'ヒョウグチケンセツ4トンシャ', category: 'unyu', status: 'active', order: 55, createdAt: '2026-08-03T00:00:00.000Z', usageCount: 0 },
        { id: 'site_unyu_55', name: '㈱フェアロード', furigana: 'フェアロード', category: 'unyu', status: 'active', order: 56, createdAt: '2026-08-03T00:00:00.000Z', usageCount: 0 },
        { id: 'site_unyu_56', name: '㈱フェアロード 4t車', furigana: 'フェアロード4トンシャ', category: 'unyu', status: 'active', order: 57, createdAt: '2026-08-03T00:00:00.000Z', usageCount: 0 },
        { id: 'site_unyu_57', name: '㈱福岡重機センター', furigana: 'フクオカジュウキセンター', category: 'unyu', status: 'active', order: 58, createdAt: '2026-08-03T00:00:00.000Z', usageCount: 0 },
        { id: 'site_unyu_58', name: '福山総合建設㈱', furigana: 'フクヤマソウゴウケンセツ', category: 'unyu', status: 'active', order: 59, createdAt: '2026-08-03T00:00:00.000Z', usageCount: 0 },
        { id: 'site_unyu_59', name: '藤木建設㈱', furigana: 'フジキケンセツ', category: 'unyu', status: 'active', order: 60, createdAt: '2026-08-03T00:00:00.000Z', usageCount: 0 },
        { id: 'site_unyu_60', name: '㈱フジタ建設', furigana: 'フジタケンセツ', category: 'unyu', status: 'active', order: 61, createdAt: '2026-08-03T00:00:00.000Z', usageCount: 0 },
        { id: 'site_unyu_61', name: '藤田農園', furigana: 'フジタノウエン', category: 'unyu', status: 'active', order: 62, createdAt: '2026-08-03T00:00:00.000Z', usageCount: 0 },
        { id: 'site_unyu_62', name: '増田運送㈲', furigana: 'マスダウンソウ', category: 'unyu', status: 'active', order: 63, createdAt: '2026-08-03T00:00:00.000Z', usageCount: 0 },
        { id: 'site_unyu_63', name: '㈲松尾建設工業', furigana: 'マツオケンセツコウギョウ', category: 'unyu', status: 'active', order: 64, createdAt: '2026-08-03T00:00:00.000Z', usageCount: 0 },
        { id: 'site_unyu_64', name: '㈱松原土木', furigana: 'マツバラドボク', category: 'unyu', status: 'active', order: 65, createdAt: '2026-08-03T00:00:00.000Z', usageCount: 0 },
        { id: 'site_unyu_65', name: '㈲松本技建', furigana: 'マツモトギケン', category: 'unyu', status: 'active', order: 66, createdAt: '2026-08-03T00:00:00.000Z', usageCount: 0 },
        { id: 'site_unyu_66', name: '宮﨑・ヤナギJV', furigana: 'ミヤザキ・ヤナギジェイブイ', category: 'unyu', status: 'active', order: 67, createdAt: '2026-08-03T00:00:00.000Z', usageCount: 0 },
        { id: 'site_unyu_67', name: '㈱松尾組', furigana: 'マツオグミ', category: 'unyu', status: 'active', order: 68, createdAt: '2026-08-03T00:00:00.000Z', usageCount: 0 },
        { id: 'site_unyu_68', name: '㈱松尾道路', furigana: 'マツオドウロ', category: 'unyu', status: 'active', order: 69, createdAt: '2026-08-03T00:00:00.000Z', usageCount: 0 },
        { id: 'site_unyu_69', name: '㈱宮﨑組', furigana: 'ミヤザキグミ', category: 'unyu', status: 'active', order: 70, createdAt: '2026-08-03T00:00:00.000Z', usageCount: 0 },
        { id: 'site_unyu_70', name: '㈱宮本組', furigana: 'ミヤモトグミ', category: 'unyu', status: 'active', order: 71, createdAt: '2026-08-03T00:00:00.000Z', usageCount: 0 },
        { id: 'site_unyu_71', name: '㈱宮本舗道工業', furigana: 'ミヤモトホドウコウギョウ', category: 'unyu', status: 'active', order: 72, createdAt: '2026-08-03T00:00:00.000Z', usageCount: 0 },
        { id: 'site_unyu_72', name: '㈱八幡道路', furigana: 'ヤハタドウロ', category: 'unyu', status: 'active', order: 73, createdAt: '2026-08-03T00:00:00.000Z', usageCount: 0 },
        { id: 'site_unyu_73', name: '㈱山賀', furigana: 'ヤマガ', category: 'unyu', status: 'active', order: 74, createdAt: '2026-08-03T00:00:00.000Z', usageCount: 0 },
        { id: 'site_unyu_74', name: '㈱山住工業', furigana: 'ヤマズミコウギョウ', category: 'unyu', status: 'active', order: 75, createdAt: '2026-08-03T00:00:00.000Z', usageCount: 0 },
        { id: 'site_unyu_75', name: '㈱山瀬組', furigana: 'ヤマセグミ', category: 'unyu', status: 'active', order: 76, createdAt: '2026-08-03T00:00:00.000Z', usageCount: 0 },
        { id: 'site_unyu_76', name: '㈲山田建設興業', furigana: 'ヤマダケンセツコウギョウ', category: 'unyu', status: 'active', order: 77, createdAt: '2026-08-03T00:00:00.000Z', usageCount: 0 },
        { id: 'site_unyu_77', name: '㈲山田建設興業 フェアロード', furigana: 'ヤマダケンセツコウギョウフェアロード', category: 'unyu', status: 'active', order: 78, createdAt: '2026-08-03T00:00:00.000Z', usageCount: 0 },
        { id: 'site_unyu_78', name: '㈲山田建設興業 4t車', furigana: 'ヤマダケンセツコウギョウ4トンシャ', category: 'unyu', status: 'active', order: 79, createdAt: '2026-08-03T00:00:00.000Z', usageCount: 0 },
        { id: 'site_unyu_79', name: '㈱友和建設', furigana: 'ユウワケンセツ', category: 'unyu', status: 'active', order: 80, createdAt: '2026-08-03T00:00:00.000Z', usageCount: 0 },
        { id: 'site_unyu_80', name: '㈱友和建設 4t車', furigana: 'ユウワケンセツ4トンシャ', category: 'unyu', status: 'active', order: 81, createdAt: '2026-08-03T00:00:00.000Z', usageCount: 0 },
        { id: 'site_unyu_81', name: '㈲ヨシアキ建設', furigana: 'ヨシアキケンセツ', category: 'unyu', status: 'active', order: 82, createdAt: '2026-08-03T00:00:00.000Z', usageCount: 0 },
        { id: 'site_unyu_82', name: 'ローカルワーカー㈱', furigana: 'ローカルワーカー', category: 'unyu', status: 'active', order: 83, createdAt: '2026-08-03T00:00:00.000Z', usageCount: 0 },
        { id: 'site_unyu_83', name: '浅沼・有田JV', furigana: 'アサヌマ・アリタジェイブイ', category: 'unyu', status: 'active', order: 84, createdAt: '2026-08-03T00:00:00.000Z', usageCount: 0 },
        { id: 'site_unyu_84', name: '鹿島道路㈱', furigana: 'カジマドウロ', category: 'unyu', status: 'active', order: 85, createdAt: '2026-08-03T00:00:00.000Z', usageCount: 0 },
        { id: 'site_unyu_85', name: 'YAMAZAKI', furigana: 'ヤマザキ', category: 'unyu', status: 'active', order: 86, createdAt: '2026-08-03T00:00:00.000Z', usageCount: 0 },
        { id: 'site_unyu_86', name: '㈱山口舗道', furigana: 'ヤマグチホドウ', category: 'unyu', status: 'active', order: 87, createdAt: '2026-08-03T00:00:00.000Z', usageCount: 0 }
      ],

      vehicles: [
        { id: 'v_1', displayName: '10tダンプ1', plateNumber: '', vehicleType: '10tダンプ', status: 'available', order: 1, active: true, todayGroupId: null },
        { id: 'v_2', displayName: '10tダンプ2', plateNumber: '', vehicleType: '10tダンプ', status: 'available', order: 2, active: true, todayGroupId: null },
        { id: 'v_3', displayName: '10tダンプ3', plateNumber: '', vehicleType: '10tダンプ', status: 'available', order: 3, active: true, todayGroupId: null },
        { id: 'v_4', displayName: '10tダンプ4', plateNumber: '', vehicleType: '10tダンプ', status: 'available', order: 4, active: true, todayGroupId: null },
        { id: 'v_5', displayName: '10tダンプ5', plateNumber: '', vehicleType: '10tダンプ', status: 'available', order: 5, active: true, todayGroupId: null },
        { id: 'v_6', displayName: '10tダンプ6', plateNumber: '', vehicleType: '10tダンプ', status: 'available', order: 6, active: true, todayGroupId: null },
        { id: 'v_7', displayName: '10tダンプ7', plateNumber: '', vehicleType: '10tダンプ', status: 'available', order: 7, active: true, todayGroupId: null },
        { id: 'v_8', displayName: '10tダンプ8', plateNumber: '', vehicleType: '10tダンプ', status: 'available', order: 8, active: true, todayGroupId: null },
        { id: 'v_9', displayName: '10tダンプ9', plateNumber: '', vehicleType: '10tダンプ', status: 'available', order: 9, active: true, todayGroupId: null },
        { id: 'v_10', displayName: '10tダンプ10', plateNumber: '', vehicleType: '10tダンプ', status: 'available', order: 10, active: true, todayGroupId: null },
        { id: 'v_11', displayName: '10tダンプ11', plateNumber: '', vehicleType: '10tダンプ', status: 'available', order: 11, active: true, todayGroupId: null },
        { id: 'v_12', displayName: '10tダンプ12', plateNumber: '', vehicleType: '10tダンプ', status: 'available', order: 12, active: true, todayGroupId: null },
        { id: 'v_13', displayName: '10tダンプ13', plateNumber: '', vehicleType: '10tダンプ', status: 'available', order: 13, active: true, todayGroupId: null },
        { id: 'v_14', displayName: '10tダンプ14', plateNumber: '', vehicleType: '10tダンプ', status: 'available', order: 14, active: true, todayGroupId: null },
        { id: 'v_15', displayName: '10tダンプ15', plateNumber: '', vehicleType: '10tダンプ', status: 'available', order: 15, active: true, todayGroupId: null },
        { id: 'v_16', displayName: '10tダンプ16', plateNumber: '', vehicleType: '10tダンプ', status: 'available', order: 16, active: true, todayGroupId: null },
        { id: 'v_17', displayName: '10tダンプ17', plateNumber: '', vehicleType: '10tダンプ', status: 'available', order: 17, active: true, todayGroupId: null },
        { id: 'v_18', displayName: '10tダンプ18', plateNumber: '', vehicleType: '10tダンプ', status: 'available', order: 18, active: true, todayGroupId: null },
        { id: 'v_19', displayName: '10tダンプ19', plateNumber: '', vehicleType: '10tダンプ', status: 'available', order: 19, active: true, todayGroupId: null },
        { id: 'v_20', displayName: '4tダンプ3439', plateNumber: '3439', vehicleType: '4tダンプ', status: 'available', order: 20, active: true, todayGroupId: null }
      ],

      // 当日の配置枠(同じ現場マスタでも複数作れる)。例:
      // { id, siteId, date, sequence, displayLabel, department, order, active, createdAt }
      dispatchGroups: [],

      // 配置枠内の運転手とダンプの組合せ。
      // { id, groupId, staffId, vehicleId, createdAt }
      assignments: [],

      // 出退勤の打刻記録(日次・月次CSV出力の元データ)
      attendanceLogs: [],

      // スケジュール(講習・会議・休みなど)。事務員がスケジュール管理
      // 画面から登録し、対象者の出退勤メニューに「予定あり」として表示する。
      // { id, type, title, note, date, staffIds, createdAt }
      scheduleEvents: [],

      updatedAt: null
    };
  }

  global.createSeedState = createSeedState;
})(window);
