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
        { id: 'st_1', name: '土木社員1', department: 'doboku', attendance: 'absent',
          normalVehicleId: null, todayVehicleId: null, todaySiteId: null, order: 1, active: true },
        { id: 'st_2', name: '土木社員2', department: 'doboku', attendance: 'absent',
          normalVehicleId: null, todayVehicleId: null, todaySiteId: null, order: 2, active: true },
        { id: 'st_3', name: '土木社員3', department: 'doboku', attendance: 'absent',
          normalVehicleId: null, todayVehicleId: null, todaySiteId: null, order: 3, active: true },

        // ---- 運輸部門 ----
        { id: 'st_4', name: '運転手1', department: 'unyu', attendance: 'absent',
          normalVehicleId: 'v_1', todayVehicleId: null, todaySiteId: null, order: 1, active: true },
        { id: 'st_5', name: '運転手2', department: 'unyu', attendance: 'absent',
          normalVehicleId: 'v_2', todayVehicleId: null, todaySiteId: null, order: 2, active: true },
        { id: 'st_6', name: '運転手3', department: 'unyu', attendance: 'absent',
          normalVehicleId: 'v_3', todayVehicleId: null, todaySiteId: null, order: 3, active: true }
      ],

      sites: [
        { id: 'site_1', name: '本社', category: 'common', status: 'active', order: 1, createdAt: '2026-01-01T00:00:00.000Z', usageCount: 0 },
        { id: 'site_2', name: 'サンプル土木現場', category: 'doboku', status: 'active', order: 2, createdAt: '2026-01-01T00:00:00.000Z', usageCount: 0 },
        { id: 'site_3', name: 'サンプル運輸現場', category: 'unyu', status: 'active', order: 3, createdAt: '2026-01-01T00:00:00.000Z', usageCount: 0 }
      ],

      vehicles: [
        { id: 'v_1', displayName: '10tダンプ1', plateNumber: '', vehicleType: '10tダンプ', status: 'available', order: 1, active: true },
        { id: 'v_2', displayName: '10tダンプ2', plateNumber: '', vehicleType: '10tダンプ', status: 'available', order: 2, active: true },
        { id: 'v_3', displayName: '10tダンプ3', plateNumber: '', vehicleType: '10tダンプ', status: 'available', order: 3, active: true },
        { id: 'v_4', displayName: '4tダンプ1', plateNumber: '', vehicleType: '4tダンプ', status: 'available', order: 4, active: true },
        { id: 'v_5', displayName: '軽トラ1', plateNumber: '', vehicleType: '軽トラ', status: 'available', order: 5, active: true }
      ],

      // 出退勤の打刻記録(日次・月次CSV出力の元データ)
      attendanceLogs: [],

      updatedAt: null
    };
  }

  global.createSeedState = createSeedState;
})(window);
