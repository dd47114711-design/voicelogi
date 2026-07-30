/*
 * seed.js
 * ---------------------------------------------------------------
 * 動作確認用の初期データ(仮データ)。
 * 実際の社員名・車両番号・現場名が決まったら、この関数の中身を
 * 差し替えるだけで良い。差し替えても保存済みの実データは
 * (別途「保存データを消去」しない限り)上書きされない。
 *
 * データ構造:
 *   staff   : 人員マスタ + 当日の割当を1レコードにまとめたもの
 *   sites   : 現場マスタ
 *   vehicles: 車両マスタ
 */
(function (global) {

  function createSeedState() {
    return {
      version: 1,
      staff: [
        // ---- 土木部門 ----
        // 黒瀬大祐・黒瀬裕(専務)・黒瀬剛(社長)は土木の現場にも入るため、
        // 通常はダンプを持たないが、必要な日だけ本人の名前タップから
        // 「ダンプを選択」して運輸のダンプに乗ることができる。
        { id: 'st_1', name: '黒瀬大祐', department: 'doboku', attendance: 'absent',
          normalVehicleId: null, todayVehicleId: null, todaySiteId: null, order: 1, active: true },
        { id: 'st_2', name: '村田広実', department: 'doboku', attendance: 'absent',
          normalVehicleId: null, todayVehicleId: null, todaySiteId: null, order: 2, active: true },
        { id: 'st_3', name: '垣﨑和幸', department: 'doboku', attendance: 'absent',
          normalVehicleId: null, todayVehicleId: null, todaySiteId: null, order: 3, active: true },
        { id: 'st_4', name: '小野一也', department: 'doboku', attendance: 'absent',
          normalVehicleId: null, todayVehicleId: null, todaySiteId: null, order: 4, active: true },
        { id: 'st_5', name: '桒野修平', department: 'doboku', attendance: 'absent',
          normalVehicleId: null, todayVehicleId: null, todaySiteId: null, order: 5, active: true },
        { id: 'st_6', name: '川脇諒', department: 'doboku', attendance: 'absent',
          normalVehicleId: null, todayVehicleId: null, todaySiteId: null, order: 6, active: true },
        { id: 'st_7', name: '黒瀬裕', department: 'doboku', attendance: 'absent',
          normalVehicleId: null, todayVehicleId: null, todaySiteId: null, order: 7, active: true },
        { id: 'st_8', name: '黒瀬剛', department: 'doboku', attendance: 'absent',
          normalVehicleId: null, todayVehicleId: null, todaySiteId: null, order: 8, active: true },
        { id: 'st_9', name: '水口経光', department: 'doboku', attendance: 'absent',
          normalVehicleId: null, todayVehicleId: null, todaySiteId: null, order: 9, active: true },

        // ---- 運輸部門(ダンプ運転手。通常ダンプは車番と対応) ----
        { id: 'st_10', name: '森元義紀', department: 'unyu', attendance: 'absent',
          normalVehicleId: 'v_1', todayVehicleId: null, todaySiteId: null, order: 1, active: true },
        { id: 'st_11', name: '黒瀬優貴', department: 'unyu', attendance: 'absent',
          normalVehicleId: 'v_2', todayVehicleId: null, todaySiteId: null, order: 2, active: true },
        { id: 'st_12', name: '荒瀬弘章', department: 'unyu', attendance: 'absent',
          normalVehicleId: 'v_3', todayVehicleId: null, todaySiteId: null, order: 3, active: true },
        { id: 'st_13', name: '笹林武弘', department: 'unyu', attendance: 'absent',
          normalVehicleId: 'v_4', todayVehicleId: null, todaySiteId: null, order: 4, active: true },
        { id: 'st_14', name: '原田隆幸', department: 'unyu', attendance: 'absent',
          normalVehicleId: 'v_5', todayVehicleId: null, todaySiteId: null, order: 5, active: true },
        { id: 'st_15', name: '松本健太郎', department: 'unyu', attendance: 'absent',
          normalVehicleId: 'v_6', todayVehicleId: null, todaySiteId: null, order: 6, active: true },
        { id: 'st_16', name: '恵良誠', department: 'unyu', attendance: 'absent',
          normalVehicleId: 'v_7', todayVehicleId: null, todaySiteId: null, order: 7, active: true },
        { id: 'st_17', name: '木戸伸也', department: 'unyu', attendance: 'absent',
          normalVehicleId: 'v_8', todayVehicleId: null, todaySiteId: null, order: 8, active: true },
        { id: 'st_18', name: '安達利博', department: 'unyu', attendance: 'absent',
          normalVehicleId: 'v_9', todayVehicleId: null, todaySiteId: null, order: 9, active: true },
        { id: 'st_19', name: '池田賢司', department: 'unyu', attendance: 'absent',
          normalVehicleId: 'v_10', todayVehicleId: null, todaySiteId: null, order: 10, active: true },
        { id: 'st_20', name: '杉尾浩志', department: 'unyu', attendance: 'absent',
          normalVehicleId: 'v_11', todayVehicleId: null, todaySiteId: null, order: 11, active: true },
        { id: 'st_21', name: '網分直臣', department: 'unyu', attendance: 'absent',
          normalVehicleId: 'v_12', todayVehicleId: null, todaySiteId: null, order: 12, active: true },
        // 黒瀬隆(車番13の通常運転手)は現在は会長で運転頻度が少ないため、
        // 出勤していない日は13番が「空車」に見え、他の人(土木を含む)が
        // 乗った日はその人の名前・ダンプ札に表示される。
        { id: 'st_22', name: '黒瀬隆', department: 'unyu', attendance: 'absent',
          normalVehicleId: 'v_13', todayVehicleId: null, todaySiteId: null, order: 13, active: true },
        { id: 'st_23', name: '三浦孝', department: 'unyu', attendance: 'absent',
          normalVehicleId: 'v_14', todayVehicleId: null, todaySiteId: null, order: 14, active: true },
        { id: 'st_24', name: '長野進', department: 'unyu', attendance: 'absent',
          normalVehicleId: 'v_15', todayVehicleId: null, todaySiteId: null, order: 15, active: true },
        { id: 'st_25', name: '土屋博正', department: 'unyu', attendance: 'absent',
          normalVehicleId: 'v_16', todayVehicleId: null, todaySiteId: null, order: 16, active: true },
        { id: 'st_26', name: '木本福介', department: 'unyu', attendance: 'absent',
          normalVehicleId: 'v_17', todayVehicleId: null, todaySiteId: null, order: 17, active: true },
        { id: 'st_27', name: '大迫博起', department: 'unyu', attendance: 'absent',
          normalVehicleId: 'v_18', todayVehicleId: null, todaySiteId: null, order: 18, active: true },
        { id: 'st_28', name: '冨永浩', department: 'unyu', attendance: 'absent',
          normalVehicleId: 'v_19', todayVehicleId: null, todaySiteId: null, order: 19, active: true },
        { id: 'st_29', name: '栢原勲', department: 'unyu', attendance: 'absent',
          normalVehicleId: 'v_20', todayVehicleId: null, todaySiteId: null, order: 20, active: true }
      ],

      sites: [
        { id: 'site_1', name: '本社', category: 'common', status: 'active', order: 1, createdAt: '2026-01-01T00:00:00.000Z', usageCount: 0 }
      ],

      vehicles: [
        { id: 'v_1', displayName: '10tダンプ1', plateNumber: '', vehicleType: '10tダンプ', status: 'available', order: 1, active: true },
        { id: 'v_2', displayName: '10tダンプ2', plateNumber: '', vehicleType: '10tダンプ', status: 'available', order: 2, active: true },
        { id: 'v_3', displayName: '10tダンプ3', plateNumber: '', vehicleType: '10tダンプ', status: 'available', order: 3, active: true },
        { id: 'v_4', displayName: '10tダンプ4', plateNumber: '', vehicleType: '10tダンプ', status: 'available', order: 4, active: true },
        { id: 'v_5', displayName: '10tダンプ5', plateNumber: '', vehicleType: '10tダンプ', status: 'available', order: 5, active: true },
        { id: 'v_6', displayName: '10tダンプ6', plateNumber: '', vehicleType: '10tダンプ', status: 'available', order: 6, active: true },
        { id: 'v_7', displayName: '10tダンプ7', plateNumber: '', vehicleType: '10tダンプ', status: 'available', order: 7, active: true },
        { id: 'v_8', displayName: '10tダンプ8', plateNumber: '', vehicleType: '10tダンプ', status: 'available', order: 8, active: true },
        { id: 'v_9', displayName: '10tダンプ9', plateNumber: '', vehicleType: '10tダンプ', status: 'available', order: 9, active: true },
        { id: 'v_10', displayName: '10tダンプ10', plateNumber: '', vehicleType: '10tダンプ', status: 'available', order: 10, active: true },
        { id: 'v_11', displayName: '10tダンプ11', plateNumber: '', vehicleType: '10tダンプ', status: 'available', order: 11, active: true },
        { id: 'v_12', displayName: '10tダンプ12', plateNumber: '', vehicleType: '10tダンプ', status: 'available', order: 12, active: true },
        { id: 'v_13', displayName: '10tダンプ13', plateNumber: '', vehicleType: '10tダンプ', status: 'available', order: 13, active: true },
        { id: 'v_14', displayName: '10tダンプ14', plateNumber: '', vehicleType: '10tダンプ', status: 'available', order: 14, active: true },
        { id: 'v_15', displayName: '10tダンプ15', plateNumber: '', vehicleType: '10tダンプ', status: 'available', order: 15, active: true },
        { id: 'v_16', displayName: '10tダンプ16', plateNumber: '', vehicleType: '10tダンプ', status: 'available', order: 16, active: true },
        { id: 'v_17', displayName: '10tダンプ17', plateNumber: '', vehicleType: '10tダンプ', status: 'available', order: 17, active: true },
        { id: 'v_18', displayName: '10tダンプ18', plateNumber: '', vehicleType: '10tダンプ', status: 'available', order: 18, active: true },
        { id: 'v_19', displayName: '10tダンプ19', plateNumber: '', vehicleType: '10tダンプ', status: 'available', order: 19, active: true },
        { id: 'v_20', displayName: '4tダンプ3439', plateNumber: '3439', vehicleType: '4tダンプ', status: 'available', order: 20, active: true }
      ],

      // 出退勤の打刻記録(日次・月次CSV出力の元データ)
      attendanceLogs: [],

      updatedAt: null
    };
  }

  global.createSeedState = createSeedState;
})(window);
