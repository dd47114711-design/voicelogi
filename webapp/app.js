/*
 * app.js
 * ---------------------------------------------------------------
 * 画面描画とタップ操作のロジック。
 * データの読み書きは必ず Storage 経由(storage.js)で行い、
 * この中に localStorage の呼び出しを直接書かない
 * (将来サーバーDBへ差し替えるときに、この分離を保つため)。
 *
 * データモデルの要点:
 *   staff         : 人員マスタ。department(基本所属)とworkRoles(対応
 *                   可能業務)を分けて持つ。todayGroupId が当日の
 *                   配置グループ。
 *   sites         : 会社名・現場名の基本情報のみ(現場マスタ)。
 *   dispatchGroups: 当日の配置枠。同じsiteIdで複数作れる
 *                   (例: フェアロード①②③)。現場名だけで人・車両を
 *                   グルーピングしない。
 *   assignments   : 配置枠内の運転手とダンプの組合せ。
 *   vehicles      : 車両マスタ。todayGroupId は「運転手なしで
 *                   その配置枠に駐車中」を意味する。
 */
(function () {
  'use strict';

  var state = null;
  var namesMasked = false;
  var activeDepartment = 'unyu';
  var DEPARTMENT_TABS = ['doboku', 'unyu', 'office', 'summary'];

  var VEHICLE_STATUS_LABELS = {
    available: '使用可能',
    inspection: '車検',
    maintenance: '整備',
    broken: '故障',
    suspended: '使用停止'
  };
  var VEHICLE_STATUS_ORDER = ['available', 'inspection', 'maintenance', 'broken', 'suspended'];
  var DEPT_LABELS = { doboku: '土木', unyu: '運輸', office: '事務', common: '共通' };
  var ROLE_LABELS = { civil: '土木作業', dumpDriver: 'ダンプ運転', office: '事務' };
  var CIRCLED_NUMS = ['①', '②', '③', '④', '⑤', '⑥', '⑦', '⑧', '⑨', '⑩', '⑪', '⑫', '⑬', '⑭', '⑮', '⑯', '⑰', '⑱', '⑲', '⑳'];

  function circledNum(n) {
    return (n >= 1 && n <= CIRCLED_NUMS.length) ? CIRCLED_NUMS[n - 1] : '(' + n + ')';
  }

  // ============================================================
  // 起動処理
  // ============================================================
  function init() {
    state = loadOrInitState();
    scaleUI();
    window.addEventListener('resize', scaleUI);

    document.getElementById('btn-fullscreen').addEventListener('click', toggleFullscreen);
    document.getElementById('btn-vehicle-admin').addEventListener('click', function () { openVehicleAdmin(); });
    document.getElementById('btn-reset-data').addEventListener('click', function () { openResetDataConfirm(); });
    document.getElementById('btn-records').addEventListener('click', function () { openRecordsModal(); });
    document.getElementById('btn-staff-admin').addEventListener('click', function () { openStaffAdmin(); });
    document.getElementById('btn-site-admin').addEventListener('click', function () { openSiteAdmin(); });
    document.getElementById('btn-name-toggle').addEventListener('click', function () {
      namesMasked = !namesMasked;
      document.getElementById('btn-name-toggle').textContent = namesMasked ? '氏名表示' : '氏名を黒塗り';
      renderAll();
    });
    document.getElementById('btn-dispatch-register').addEventListener('click', function () { openGroupWizard('unyu'); });
    document.getElementById('btn-unyu-site-edit').addEventListener('click', function () { openExistingSiteEditPicker('unyu'); });
    document.getElementById('btn-unyu-vehicle-status').addEventListener('click', function () { openVehicleAdmin(); });
    document.getElementById('btn-doboku-dispatch-create').addEventListener('click', function () { openGroupWizard('doboku'); });
    document.getElementById('btn-doboku-expand-all').addEventListener('click', function () { setAllLanesOpen('doboku', true); });
    document.getElementById('btn-doboku-collapse-all').addEventListener('click', function () { setAllLanesOpen('doboku', false); });
    document.getElementById('btn-unyu-expand-all').addEventListener('click', function () { setAllLanesOpen('unyu', true); });
    document.getElementById('btn-unyu-collapse-all').addEventListener('click', function () { setAllLanesOpen('unyu', false); });

    var savedDept = Storage.loadActiveDepartment();
    activeDepartment = DEPARTMENT_TABS.indexOf(savedDept) !== -1 ? savedDept : 'unyu';
    document.querySelectorAll('.dept-tab').forEach(function (btn) {
      btn.addEventListener('click', function () { switchDepartment(btn.getAttribute('data-dept')); });
    });
    applyActiveDepartmentUI();

    updateClock();
    setInterval(updateClock, 1000);

    renderAll();
  }

  // ============================================================
  // 部門タブ切替: ページ全体を再読み込みせず、同じHTML内で表示対象
  // (dept-section)だけをCSSで切り替える。データ・イベント処理は
  // renderAll()側で一括描画しており、タブ切替自体は表示/非表示の
  // 切り替えのみなので、スクロール位置は要素がDOMに残ったまま
  // 自然に保持される。
  // ============================================================
  function switchDepartment(dept) {
    if (DEPARTMENT_TABS.indexOf(dept) === -1 || dept === activeDepartment) return;
    activeDepartment = dept;
    Storage.saveActiveDepartment(dept);
    applyActiveDepartmentUI();
  }

  function applyActiveDepartmentUI() {
    DEPARTMENT_TABS.forEach(function (dept) {
      var tab = document.querySelector('.dept-tab[data-dept="' + dept + '"]');
      var panel = document.querySelector('.dept-section[data-panel="' + dept + '"]');
      var active = dept === activeDepartment;
      if (tab) tab.classList.toggle('is-active', active);
      if (panel) panel.classList.toggle('is-active', active);
    });
  }

  function loadOrInitState() {
    var loaded = Storage.loadState();
    if (!loaded || !loaded.staff || !loaded.sites || !loaded.vehicles) {
      var fresh = createSeedState();
      Storage.saveState(fresh);
      return fresh;
    }
    var needsSave = migrateAttendanceLogs(loaded);
    if (migrateToGroupModel(loaded)) needsSave = true;
    if (needsSave) Storage.saveState(loaded);
    return loaded;
  }

  // 旧形式(1人1日1レコードで clockIn/clockOut を上書き保存)のattendanceLogsを、
  // 新形式(出勤・退勤タップ毎に1件追加するイベントログ)へ変換する。
  // 既に新形式のレコードはそのまま残し、人員・現場・車両など他のデータには触れない。
  function migrateAttendanceLogs(loaded) {
    var needsMigration = loaded.attendanceLogs.some(function (r) { return !r.action; });
    if (!needsMigration) return false;
    var migrated = [];
    loaded.attendanceLogs.forEach(function (r) {
      if (r.action) { migrated.push(r); return; }
      var deptLabel = DEPT_LABELS[r.department] || r.department;
      if (r.clockIn) {
        migrated.push({
          id: r.id + '_in', personId: r.staffId, personName: r.staffName, department: deptLabel,
          action: 'clockIn', timestamp: r.clockIn, date: r.date, createdAt: r.clockIn
        });
      }
      if (r.clockOut) {
        migrated.push({
          id: r.id + '_out', personId: r.staffId, personName: r.staffName, department: deptLabel,
          action: 'clockOut', timestamp: r.clockOut, date: r.date, createdAt: r.clockOut
        });
      }
    });
    loaded.attendanceLogs = migrated;
    return true;
  }

  // 旧形式(todaySiteId / todayVehicleIdだけを持つ、配置グループの概念が
  // 無いデータ)を、dispatchGroups / assignments を使う新形式へ移行する。
  // 保存済みの出退勤記録・人員登録・車両登録には一切触れない。
  function migrateToGroupModel(loaded) {
    var changed = false;

    if (!loaded.dispatchGroups) { loaded.dispatchGroups = []; changed = true; }
    if (!loaded.assignments) { loaded.assignments = []; changed = true; }

    loaded.staff.forEach(function (s) {
      if (!s.workRoles) {
        s.workRoles = s.department === 'doboku' ? ['civil'] : s.department === 'unyu' ? ['dumpDriver'] : ['office'];
        changed = true;
      }
      if (typeof s.todayGroupId === 'undefined') { s.todayGroupId = null; changed = true; }
      if (typeof s.active === 'undefined') { s.active = true; changed = true; }
    });
    loaded.vehicles.forEach(function (v) {
      if (typeof v.todayGroupId === 'undefined') { v.todayGroupId = null; changed = true; }
    });

    // 旧フィールド(todaySiteId)がまだ残っているデータだけ、配置グループへ変換する。
    var hasLegacySiteField = loaded.staff.some(function (s) { return typeof s.todaySiteId !== 'undefined' && s.todaySiteId; }) ||
      loaded.vehicles.some(function (v) { return typeof v.todaySiteId !== 'undefined' && v.todaySiteId; });
    if (hasLegacySiteField) {
      changed = true;
      var groupMap = {}; // key: department + '|' + siteId -> group
      function findSiteRaw(id) { return loaded.sites.find(function (s) { return s.id === id; }); }
      function nextSeqRaw(siteId, department) {
        var max = 0;
        loaded.dispatchGroups.forEach(function (g) {
          if (g.siteId === siteId && g.department === department) max = Math.max(max, g.sequence || 0);
        });
        return max + 1;
      }
      function ensureGroup(siteId, department) {
        var key = department + '|' + siteId;
        if (groupMap[key]) return groupMap[key];
        var seq = nextSeqRaw(siteId, department);
        var site = findSiteRaw(siteId);
        var grp = {
          id: genId('group'), siteId: siteId, date: formatYMD(new Date()), sequence: seq,
          displayLabel: (site ? site.name : '現場') + circledNum(seq),
          department: department, order: seq, active: true, createdAt: new Date().toISOString()
        };
        loaded.dispatchGroups.push(grp);
        groupMap[key] = grp;
        return grp;
      }
      function legacyEffectiveVehicleId(s) {
        if (s.todayVehicleId === null || s.todayVehicleId === undefined) return s.normalVehicleId || null;
        if (s.todayVehicleId === 'UNASSIGNED') return null;
        return s.todayVehicleId;
      }
      loaded.staff.forEach(function (s) {
        if (s.todaySiteId && s.attendance === 'present') {
          var grp = ensureGroup(s.todaySiteId, s.department);
          s.todayGroupId = grp.id;
          var vid = legacyEffectiveVehicleId(s);
          if (vid) {
            loaded.assignments.push({ id: genId('asn'), groupId: grp.id, staffId: s.id, vehicleId: vid, createdAt: new Date().toISOString() });
          }
        }
        delete s.todaySiteId;
        delete s.todayVehicleId;
      });
      loaded.vehicles.forEach(function (v) {
        var claimed = loaded.assignments.some(function (a) { return a.vehicleId === v.id; });
        if (!claimed && v.todaySiteId) {
          var grp = ensureGroup(v.todaySiteId, 'unyu');
          v.todayGroupId = grp.id;
        }
        delete v.todaySiteId;
      });
    }

    // 初期データの事務員(黒瀬とも美・山内舞・江川愛梨・谷口扶美代)が
    // 居なければ追加する(同姓同名が既にいる場合は追加しない)。
    var officeSeedStaff = [
      { id: 'staff_office_1', name: '黒瀬とも美', order: 1 },
      { id: 'staff_office_2', name: '山内舞', order: 2 },
      { id: 'staff_office_3', name: '江川愛梨', order: 3 },
      { id: 'staff_office_4', name: '谷口扶美代', order: 4 }
    ];
    officeSeedStaff.forEach(function (seed) {
      if (loaded.staff.some(function (s) { return s.name === seed.name; })) return;
      loaded.staff.push({
        id: seed.id, name: seed.name, department: 'office', workRoles: ['office'],
        attendance: 'absent', normalVehicleId: null, todayVehicleId: null, todayGroupId: null, order: seed.order, active: true
      });
      changed = true;
    });

    return changed;
  }

  function persist() {
    Storage.saveState(state);
  }

  // 32インチ縦型モニター(基準1080px幅)に合わせて文字・ボタンの
  // 基準サイズをスケールする。画面幅が基準より大きくても小さくなり
  // すぎないようにする。
  function scaleUI() {
    var baseWidth = 1080;
    var w = window.innerWidth || baseWidth;
    var scale = w / baseWidth;
    scale = Math.max(0.75, Math.min(scale, 2.4));
    document.documentElement.style.fontSize = Math.round(16 * scale) + 'px';
  }

  function toggleFullscreen() {
    if (!document.fullscreenElement) {
      var el = document.documentElement;
      if (el.requestFullscreen) el.requestFullscreen();
    } else {
      if (document.exitFullscreen) document.exitFullscreen();
    }
  }

  function pad2(n) { return n < 10 ? '0' + n : '' + n; }

  var WEEKDAY_LABELS = ['日', '月', '火', '水', '木', '金', '土'];

  function formatDateJP(d) {
    return d.getFullYear() + '年' + (d.getMonth() + 1) + '月' + d.getDate() + '日(' + WEEKDAY_LABELS[d.getDay()] + ')';
  }

  function formatYMD(d) {
    return d.getFullYear() + '-' + pad2(d.getMonth() + 1) + '-' + pad2(d.getDate());
  }

  function formatTimeHM(iso) {
    if (!iso) return '';
    var d = new Date(iso);
    return pad2(d.getHours()) + ':' + pad2(d.getMinutes());
  }

  function formatDurationHM(startIso, endIso) {
    if (!startIso || !endIso) return '';
    var ms = new Date(endIso).getTime() - new Date(startIso).getTime();
    if (ms < 0) return '';
    var totalMin = Math.round(ms / 60000);
    var hh = Math.floor(totalMin / 60);
    var mm = totalMin % 60;
    return hh + '時間' + pad2(mm) + '分';
  }

  // ローカルタイムゾーンのオフセット付きISO8601文字列を作る
  // (例: 2026-07-30T07:31:15+09:00)。打刻記録はこの形式で保存する。
  function toLocalISOString(d) {
    var offsetMin = -d.getTimezoneOffset();
    var sign = offsetMin >= 0 ? '+' : '-';
    var abs = Math.abs(offsetMin);
    var offH = pad2(Math.floor(abs / 60));
    var offM = pad2(abs % 60);
    return d.getFullYear() + '-' + pad2(d.getMonth() + 1) + '-' + pad2(d.getDate()) +
      'T' + pad2(d.getHours()) + ':' + pad2(d.getMinutes()) + ':' + pad2(d.getSeconds()) +
      sign + offH + ':' + offM;
  }

  function updateClock() {
    var now = new Date();
    var timeEl = document.getElementById('clock-time');
    var dateEl = document.getElementById('clock-date');
    if (timeEl) timeEl.textContent = pad2(now.getHours()) + ':' + pad2(now.getMinutes()) + ':' + pad2(now.getSeconds());
    if (dateEl) dateEl.textContent = formatDateJP(now);
  }

  // ============================================================
  // 小さなDOMヘルパー
  // ============================================================
  function h(tag, opts, children) {
    var e = document.createElement(tag);
    opts = opts || {};
    if (opts.className) e.className = opts.className;
    if (opts.text != null) e.textContent = opts.text;
    if (opts.html != null) e.innerHTML = opts.html;
    if (opts.attrs) {
      for (var k in opts.attrs) e.setAttribute(k, opts.attrs[k]);
    }
    if (opts.onClick) e.addEventListener('click', opts.onClick);
    if (opts.disabled) e.disabled = true;
    (children || []).forEach(function (c) { if (c) e.appendChild(c); });
    return e;
  }

  function genId(prefix) {
    return prefix + '_' + Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
  }

  function sortByOrder(list) {
    return list.slice().sort(function (a, b) { return (a.order || 0) - (b.order || 0); });
  }

  function findStaff(id) { return state.staff.find(function (s) { return s.id === id; }); }
  function findSite(id) { return state.sites.find(function (s) { return s.id === id; }); }
  function findVehicle(id) { return state.vehicles.find(function (v) { return v.id === id; }); }
  function findGroup(id) { return state.dispatchGroups.find(function (g) { return g.id === id; }); }

  function hasWorkRole(staff, role) { return (staff.workRoles || []).indexOf(role) !== -1; }

  // ============================================================
  // 状態変更(すべての変更はここを通り、保存 + 再描画する)
  // ============================================================
  function applyAttendanceChange(staff, status, now) {
    staff.attendance = status;
    var timestamp = toLocalISOString(now);
    state.attendanceLogs.push({
      id: genId('log'),
      personId: staff.id,
      personName: staff.name,
      department: DEPT_LABELS[staff.department] || staff.department,
      action: status === 'present' ? 'clockIn' : 'clockOut',
      timestamp: timestamp,
      date: formatYMD(now),
      createdAt: timestamp
    });
  }

  function setAttendance(staffId, status) {
    var s = findStaff(staffId);
    if (!s) return;
    var now = new Date();
    applyAttendanceChange(s, status, now);
    persist();
    renderAll();
    showToast(s.name, (status === 'present' ? '出勤' : '退勤') + ' ' + pad2(now.getHours()) + ':' + pad2(now.getMinutes()) + 'を記録しました');
  }

  // ============================================================
  // 記録完了トースト(数秒で自動的に消える)
  // ============================================================
  var toastTimer = null;
  function showToast(name, message) {
    var existing = document.getElementById('toast');
    if (existing) existing.remove();
    if (toastTimer) clearTimeout(toastTimer);

    var toast = h('div', { className: 'toast', attrs: { id: 'toast' } }, [
      h('div', { className: 'toast-name', text: name }),
      h('div', { className: 'toast-message', text: message })
    ]);
    document.body.appendChild(toast);
    requestAnimationFrame(function () { toast.classList.add('toast-show'); });

    toastTimer = setTimeout(function () {
      toast.classList.remove('toast-show');
      setTimeout(function () { toast.remove(); }, 300);
    }, 2800);
  }

  function addSite(name, category) {
    var trimmed = (name || '').trim();
    if (!trimmed) return { ok: false, reason: 'empty' };
    var exists = state.sites.some(function (s) { return s.name === trimmed; });
    if (exists) return { ok: false, reason: 'duplicate' };
    var maxOrder = state.sites.reduce(function (m, s) { return Math.max(m, s.order || 0); }, 0);
    var site = {
      id: genId('site'),
      name: trimmed,
      category: category,
      status: 'active',
      order: maxOrder + 1,
      createdAt: new Date().toISOString(),
      usageCount: 0
    };
    state.sites.push(site);
    persist();
    return { ok: true, site: site };
  }

  function setVehicleStatus(vehicleId, status) {
    var v = findVehicle(vehicleId);
    if (!v) return;
    v.status = status;
    persist();
    renderAll();
  }

  // ============================================================
  // 配置グループ(dispatchGroups)と組合せ(assignments)の基本操作
  // ------------------------------------------------------------
  // 現場マスタ(sites)はそのままに、当日の配置枠だけを複数作れる
  // ようにする層。現場名だけで人・車両をグルーピングせず、必ず
  // groupId を介して分類する。
  // ============================================================
  function relevantSites(department) {
    var sites = state.sites.filter(function (site) {
      return site.status === 'active' && (site.category === department || site.category === 'common');
    });
    sites.sort(function (a, b) {
      var diff = (b.usageCount || 0) - (a.usageCount || 0);
      if (diff !== 0) return diff;
      return (a.order || 0) - (b.order || 0);
    });
    return sites;
  }

  function groupsForSite(siteId, department, activeOnly) {
    var list = state.dispatchGroups.filter(function (g) { return g.siteId === siteId && g.department === department && (!activeOnly || g.active !== false); });
    return list.slice().sort(function (a, b) { return (a.sequence || 0) - (b.sequence || 0); });
  }

  function nextGroupSequence(siteId, department) {
    var max = 0;
    state.dispatchGroups.forEach(function (g) {
      if (g.siteId === siteId && g.department === department) max = Math.max(max, g.sequence || 0);
    });
    return max + 1;
  }

  function createDispatchGroup(siteId, department) {
    var site = findSite(siteId);
    var seq = nextGroupSequence(siteId, department);
    var grp = {
      id: genId('group'),
      siteId: siteId,
      date: formatYMD(new Date()),
      sequence: seq,
      displayLabel: (site ? site.name : '現場') + circledNum(seq),
      department: department,
      order: seq,
      active: true,
      createdAt: new Date().toISOString()
    };
    state.dispatchGroups.push(grp);
    return grp;
  }

  function groupAssignments(groupId) {
    return state.assignments.filter(function (a) { return a.groupId === groupId; });
  }

  function findAssignmentForStaff(staffId) {
    return state.assignments.find(function (a) { return a.staffId === staffId; }) || null;
  }

  function findAssignmentForVehicle(vehicleId) {
    return state.assignments.find(function (a) { return a.vehicleId === vehicleId; }) || null;
  }

  // 配置枠に所属している人(出勤・退勤を問わない。表示時にさらに絞り込む)。
  function groupMembers(groupId) {
    return state.staff.filter(function (s) { return s.active !== false && s.todayGroupId === groupId; });
  }

  // 配置枠内の「運転手が乗っている車両+運転手なしで駐車中の車両」を返す。
  function groupVehiclesWithDrivers(groupId) {
    var result = [];
    var seen = {};
    groupAssignments(groupId).forEach(function (a) {
      var v = findVehicle(a.vehicleId);
      if (v && v.active !== false && !seen[v.id]) { seen[v.id] = true; result.push({ vehicle: v, driver: findStaff(a.staffId) }); }
    });
    state.vehicles.forEach(function (v) {
      if (v.active === false || seen[v.id]) return;
      if (v.todayGroupId === groupId) { seen[v.id] = true; result.push({ vehicle: v, driver: null }); }
    });
    return result;
  }

  // 現在の配置枠(あれば)から人を外す。組合せ(assignments)があれば
  // 削除して車両を空ける。通常ダンプの設定自体は変更しない。
  function removeStaffFromGroup(staff) {
    var asn = findAssignmentForStaff(staff.id);
    if (asn) {
      var idx = state.assignments.indexOf(asn);
      if (idx !== -1) state.assignments.splice(idx, 1);
    }
    staff.todayGroupId = null;
  }

  // 誰かを配置枠へ入れる(必要ならダンプもセットで組み合わせる)。
  // 既に別の配置枠にいた場合はそちらから外し、選んだダンプを既に
  // 別の人が使っていた場合はその人から外す(その人の配置枠自体は
  // 維持し、ダンプの組合せだけ外れる)。
  function assignStaffToGroup(staffId, groupId, vehicleId) {
    var staff = findStaff(staffId);
    if (!staff) return;
    if (staff.todayGroupId !== groupId) removeStaffFromGroup(staff);
    else {
      var mine = findAssignmentForStaff(staffId);
      if (mine) { var mi = state.assignments.indexOf(mine); if (mi !== -1) state.assignments.splice(mi, 1); }
    }
    staff.todayGroupId = groupId;
    if (vehicleId) {
      var other = findAssignmentForVehicle(vehicleId);
      if (other) { var oi = state.assignments.indexOf(other); if (oi !== -1) state.assignments.splice(oi, 1); }
      var v = findVehicle(vehicleId);
      if (v) v.todayGroupId = null;
      state.assignments.push({ id: genId('asn'), groupId: groupId, staffId: staffId, vehicleId: vehicleId, createdAt: new Date().toISOString() });
    }
  }

  // 運転手なしでダンプだけを配置枠に駐車させる。既に誰かが使っていた
  // 場合はその人の組合せだけ外す(その人の配置枠は維持)。
  function parkVehicleInGroup(vehicleId, groupId) {
    var asn = findAssignmentForVehicle(vehicleId);
    if (asn) { var i = state.assignments.indexOf(asn); if (i !== -1) state.assignments.splice(i, 1); }
    var v = findVehicle(vehicleId);
    if (v) v.todayGroupId = groupId;
  }

  // ダンプをどの配置枠からも完全に外し、空車に戻す。
  function releaseVehicleEverywhere(vehicleId) {
    var asn = findAssignmentForVehicle(vehicleId);
    if (asn) { var i = state.assignments.indexOf(asn); if (i !== -1) state.assignments.splice(i, 1); }
    var v = findVehicle(vehicleId);
    if (v) v.todayGroupId = null;
  }

  // 配置枠を終了する。現場マスタ自体は削除しない。所属していた人は
  // 「現場未定」へ戻し、ダンプは空車へ戻す。番号(sequence)は詰め直さない。
  function endGroup(groupId) {
    groupMembers(groupId).forEach(function (s) { removeStaffFromGroup(s); });
    state.vehicles.forEach(function (v) { if (v.todayGroupId === groupId) v.todayGroupId = null; });
    var g = findGroup(groupId);
    if (g) g.active = false;
  }

  // 配置枠の中身(人・組合せ・駐車中のダンプ)を、まるごと別の配置枠へ
  // 移す。移動元は自然に空になり、盤面には表示されなくなる。
  function moveGroupContents(sourceGroupId, targetGroupId) {
    groupMembers(sourceGroupId).forEach(function (s) {
      var asn = findAssignmentForStaff(s.id);
      var vehicleId = asn ? asn.vehicleId : null;
      s.todayGroupId = null;
      if (asn) { var i = state.assignments.indexOf(asn); if (i !== -1) state.assignments.splice(i, 1); }
      assignStaffToGroup(s.id, targetGroupId, vehicleId);
    });
    state.vehicles.forEach(function (v) {
      if (v.todayGroupId === sourceGroupId) v.todayGroupId = targetGroupId;
    });
    var g = findGroup(sourceGroupId);
    if (g) g.active = false;
  }

  function groupCountsLabel(groupId, department) {
    var memberCount = groupMembers(groupId).filter(function (s) { return s.attendance === 'present'; }).length;
    if (department !== 'unyu') return '現在' + memberCount + '人';
    var vehicleCount = groupVehiclesWithDrivers(groupId).length;
    return '現在' + memberCount + '人／' + vehicleCount + '台';
  }

  function isDriverAlreadyInOtherGroup(staff, targetGroupId) {
    return !!(staff.todayGroupId && staff.todayGroupId !== targetGroupId);
  }

  // 出勤・退勤に関わらず「今配置されている配置グループの部門」で
  // 盤面に表示する(土木の人が運輸の配置に入っている間は、退勤しても
  // 運輸側に札が残ったまま白/赤が切り替わるだけ)。配置枠から外れた
  // (todayGroupIdが無い)人だけ基本所属(department)で表示する。
  // 出退勤CSVは常にdepartmentを使う。
  function effectiveDisplayDept(staff) {
    if (staff.todayGroupId) {
      var g = findGroup(staff.todayGroupId);
      if (g) return g.department;
    }
    return staff.department;
  }

  function dumpDriverCandidates() {
    return state.staff.filter(function (s) { return s.active !== false && hasWorkRole(s, 'dumpDriver'); });
  }

  // ============================================================
  // 縦書き表示ヘルパー
  // ============================================================
  function escapeHtml(str) {
    return String(str).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }

  function verticalHtml(str) {
    return escapeHtml(str).replace(/(\d{1,3})/g, '<span class="tcy">$1</span>');
  }

  // ============================================================
  // メイン画面描画
  // ============================================================
  function renderAll() {
    renderDepartment('doboku-list', 'doboku');
    renderDepartment('unyu-list', 'unyu');
    renderOffice();
    renderVehicleSummaryBar();
    renderTabCounts();
    renderSummaryTab();
  }

  // ============================================================
  // 部門タブの簡易人数表示 と 全体確認タブの集計
  // ------------------------------------------------------------
  // 出勤者数・退勤者数とも「その部門のタブに実際に表示される人」
  // (=当日の配置先。配置枠から外れていない限り、退勤しても表示先は
  // 変わらない)に合わせ、buildDepartmentLanes() と同じ条件を使う。
  // ============================================================
  function deptAttendanceCounts(department) {
    var present = state.staff.filter(function (s) {
      return s.active !== false && s.attendance === 'present' && effectiveDisplayDept(s) === department;
    }).length;
    var absent = state.staff.filter(function (s) {
      return s.active !== false && s.attendance === 'absent' && effectiveDisplayDept(s) === department;
    }).length;
    return { present: present, absent: absent };
  }

  // 「稼働現場/稼働配置」は、盤面にその配置枠のレーンが表示されて
  // いるかどうか(=出勤・退勤に関わらず誰か配置されている、または
  // 運転手なしのダンプが駐車中)と揃える。
  function deptActiveGroupCount(department) {
    return state.dispatchGroups.filter(function (g) {
      if (g.department !== department || g.active === false) return false;
      var hasMember = groupMembers(g.id).length > 0;
      var hasParkedVehicle = department === 'unyu' && state.vehicles.some(function (v) {
        return v.active !== false && v.todayGroupId === g.id && !findAssignmentForVehicle(v.id);
      });
      return hasMember || hasParkedVehicle;
    }).length;
  }

  function setTabText(id, text) {
    var el = document.getElementById(id);
    if (el) el.textContent = text;
  }

  function renderTabCounts() {
    var d = deptAttendanceCounts('doboku');
    setTabText('tab-count-doboku', '出勤' + d.present + '／退勤' + d.absent);
    var u = deptAttendanceCounts('unyu');
    var vs = computeVehicleSummary().counts;
    setTabText('tab-count-unyu', '出勤' + u.present + '／退勤' + u.absent + '／使用' + vs.inUse + '台');
    var o = deptAttendanceCounts('office');
    setTabText('tab-count-office', '出勤' + o.present + '／退勤' + o.absent);
  }

  function summaryStatRow(label, value) {
    return h('div', { className: 'summary-stat-row' }, [
      h('span', { className: 'summary-stat-label', text: label }),
      h('span', { className: 'summary-stat-value', text: value })
    ]);
  }

  function renderSummaryTab() {
    var el = document.getElementById('summary-content');
    if (!el) return;
    el.innerHTML = '';

    var doboku = deptAttendanceCounts('doboku');
    el.appendChild(h('div', { className: 'summary-card summary-card-doboku' }, [
      h('div', { className: 'summary-card-header', text: '土木' }),
      h('div', { className: 'summary-card-body' }, [
        summaryStatRow('出勤', doboku.present + '人'),
        summaryStatRow('退勤', doboku.absent + '人'),
        summaryStatRow('稼働現場', deptActiveGroupCount('doboku') + '箇所')
      ]),
      h('button', { className: 'summary-open-btn', attrs: { type: 'button' }, text: '土木を開く', onClick: function () { switchDepartment('doboku'); } })
    ]));

    var unyu = deptAttendanceCounts('unyu');
    var vs = computeVehicleSummary().counts;
    el.appendChild(h('div', { className: 'summary-card summary-card-unyu' }, [
      h('div', { className: 'summary-card-header', text: '運輸' }),
      h('div', { className: 'summary-card-body' }, [
        summaryStatRow('出勤', unyu.present + '人'),
        summaryStatRow('退勤', unyu.absent + '人'),
        summaryStatRow('稼働配置', deptActiveGroupCount('unyu') + '枠'),
        summaryStatRow('使用中', vs.inUse + '台'),
        summaryStatRow('空車', vs.idle + '台'),
        summaryStatRow('整備', vs.maintenance + '台'),
        summaryStatRow('車検', vs.inspection + '台'),
        summaryStatRow('故障', vs.broken + '台'),
        summaryStatRow('使用停止', vs.suspended + '台')
      ]),
      h('button', { className: 'summary-open-btn', attrs: { type: 'button' }, text: '運輸を開く', onClick: function () { switchDepartment('unyu'); } })
    ]));

    var office = deptAttendanceCounts('office');
    el.appendChild(h('div', { className: 'summary-card summary-card-office' }, [
      h('div', { className: 'summary-card-header', text: '事務' }),
      h('div', { className: 'summary-card-body' }, [
        summaryStatRow('出勤', office.present + '人'),
        summaryStatRow('退勤', office.absent + '人')
      ]),
      h('button', { className: 'summary-open-btn', attrs: { type: 'button' }, text: '事務を開く', onClick: function () { switchDepartment('office'); } })
    ]));
  }

  var DEPARTMENT_RENDERERS = {
    doboku: { containerId: 'doboku-list' },
    unyu: { containerId: 'unyu-list' }
  };
  function rerenderDepartment(department) {
    var cfg = DEPARTMENT_RENDERERS[department];
    renderDepartment(cfg.containerId, department);
  }

  // ------------------------------------------------------------
  // 現場行(レーン)の開閉状態(保存はせず、画面を開いている間だけ保持する)
  // ------------------------------------------------------------
  var laneOpenState = { doboku: {}, unyu: {} };
  function isLaneOpen(department, key) {
    return laneOpenState[department][key] !== false;
  }
  function setLaneOpen(department, key, open) {
    laneOpenState[department][key] = open;
  }
  function toggleLane(department, key) {
    setLaneOpen(department, key, !isLaneOpen(department, key));
    rerenderDepartment(department);
  }
  function setAllLanesOpen(department, open) {
    buildDepartmentLanes(department).forEach(function (lane) { setLaneOpen(department, lane.key, open); });
    rerenderDepartment(department);
  }

  // 運輸部門だけが持つ、車両の状態にもとづく特別な行。
  var VEHICLE_LANE_STATUS_ORDER = ['maintenance', 'inspection', 'broken', 'suspended'];

  // 部門Dの盤面を「配置グループ(lane.kind==='site')・現場未定・
  // (運輸のみ)車両状態・休み」のレーン一覧として組み立てる。
  // 現場名だけでグルーピングせず、必ずgroupIdを介して分類する。
  //
  // 出退勤タップは配置(todayGroupId)を一切変えない(setAttendance参照)。
  // 実物の名札ボードと同じく、配置枠に入っている人は退勤しても
  // その配置枠のレーンに残ったまま名前札の色が白→赤に変わるだけで、
  // 「休み」レーンへは動かない。「休み」レーンに入るのは、そもそも
  // どの配置枠にも入っていない(todayGroupIdが無い)人だけ。
  function buildDepartmentLanes(department) {
    var deptStaff = state.staff.filter(function (s) { return s.active !== false && effectiveDisplayDept(s) === department; });

    var lanes = [];

    var groups = state.dispatchGroups.filter(function (g) { return g.department === department && g.active !== false; });
    var sites = relevantSites(department);
    var siteOrderIndex = {};
    sites.forEach(function (site, idx) { siteOrderIndex[site.id] = idx; });
    groups.sort(function (a, b) {
      var ai = siteOrderIndex[a.siteId]; if (ai === undefined) ai = 999;
      var bi = siteOrderIndex[b.siteId]; if (bi === undefined) bi = 999;
      if (ai !== bi) return ai - bi;
      return (a.sequence || 0) - (b.sequence || 0);
    });

    groups.forEach(function (g) {
      var members = sortByOrder(deptStaff.filter(function (s) { return s.todayGroupId === g.id; }));
      var hasParkedVehicle = department === 'unyu' && state.vehicles.some(function (v) {
        return v.active !== false && v.todayGroupId === g.id && !findAssignmentForVehicle(v.id);
      });
      if (members.length || hasParkedVehicle) {
        lanes.push({ kind: 'site', key: g.id, label: g.displayLabel, members: members });
      }
    });

    var unassigned = deptStaff.filter(function (s) { return !s.todayGroupId; });
    var unassignedPresent = sortByOrder(unassigned.filter(function (s) { return s.attendance === 'present'; }));
    if (unassignedPresent.length) {
      lanes.push({ kind: 'unassigned', key: 'UNASSIGNED', label: '現場未定', members: unassignedPresent });
    }

    if (department === 'unyu') {
      var usedVehicleIds = {};
      state.assignments.forEach(function (a) { usedVehicleIds[a.vehicleId] = true; });
      var vehicles = sortByOrder(state.vehicles.filter(function (v) { return v.active !== false; }));

      var idleVehicles = vehicles.filter(function (v) { return v.status === 'available' && !usedVehicleIds[v.id] && !v.todayGroupId; });
      if (idleVehicles.length) {
        lanes.push({ kind: 'vehicle', key: 'idle', label: '空車', vehicles: idleVehicles });
      }
      VEHICLE_LANE_STATUS_ORDER.forEach(function (statusKey) {
        var matched = vehicles.filter(function (v) { return v.status === statusKey; });
        if (matched.length) {
          lanes.push({ kind: 'vehicle', key: statusKey, label: VEHICLE_STATUS_LABELS[statusKey], vehicles: matched });
        }
      });
    }

    var unassignedAbsent = sortByOrder(unassigned.filter(function (s) { return s.attendance === 'absent'; }));
    if (unassignedAbsent.length) {
      lanes.push({ kind: 'absent', key: 'ABSENT', label: '休み', members: unassignedAbsent });
    }

    return lanes;
  }

  // 配置グループに属さない「現場未定・休み」レーン用: メンバーの
  // 通常ダンプ(normalVehicleId)から、重複のない車両一覧を作る。
  function legacyVehiclesForMembers(members) {
    var seen = {};
    var result = [];
    members.forEach(function (s) {
      var vid = s.normalVehicleId;
      if (vid && !seen[vid]) { seen[vid] = true; var v = findVehicle(vid); if (v && v.active !== false) result.push({ vehicle: v, driver: s }); }
    });
    return result;
  }

  function laneVehiclePairs(department, lane) {
    if (lane.kind === 'site') return groupVehiclesWithDrivers(lane.key);
    if (department === 'unyu' && (lane.kind === 'unassigned' || lane.kind === 'absent')) return legacyVehiclesForMembers(lane.members);
    return [];
  }

  // 車両20台全体の集計(使用中・空車・整備・車検・故障・使用停止)。
  function computeVehicleSummary() {
    var vehicles = state.vehicles.filter(function (v) { return v.active !== false; });
    var usedIds = {};
    state.assignments.forEach(function (a) { usedIds[a.vehicleId] = true; });

    var counts = { inUse: 0, idle: 0, maintenance: 0, inspection: 0, broken: 0, suspended: 0, unknown: 0 };
    vehicles.forEach(function (v) {
      if (v.status === 'available') {
        if (usedIds[v.id] || v.todayGroupId) counts.inUse++; else counts.idle++;
      } else if (VEHICLE_STATUS_ORDER.indexOf(v.status) !== -1) {
        counts[v.status]++;
      } else {
        counts.unknown++;
      }
    });
    return { counts: counts, total: vehicles.length };
  }

  function renderVehicleSummaryBar() {
    var el = document.getElementById('unyu-summary');
    if (!el) return;
    el.innerHTML = '';
    var summary = computeVehicleSummary();
    var c = summary.counts;
    el.appendChild(h('span', {
      className: 'summary-text',
      text: '車両: 使用中' + c.inUse + '台 / 空車' + c.idle + '台 / 整備' + c.maintenance + '台 / 車検' + c.inspection +
        '台 / 故障' + c.broken + '台 / 使用停止' + c.suspended + '台 (合計' + summary.total + '台)'
    }));
    if (c.unknown > 0) {
      el.appendChild(h('span', {
        className: 'summary-warning',
        text: '警告：登録車両' + summary.total + '台のうち、' + c.unknown + '台の状態が確認できません。'
      }));
    }
  }

  function laneColorClass(lane, department) {
    if (lane.kind === 'vehicle') return 'lane-vehicle-' + lane.key;
    return 'lane-' + lane.kind + '-' + department;
  }

  // ------------------------------------------------------------
  // 配置グループの表示: 実物の札ボードと同じく、
  //   左＝運転手(作業員)の名前札を複数、中央＝現場名の札、
  //   右＝ダンプ札を複数 という3カラムで組み立てる。
  // ------------------------------------------------------------
  function buildLaneEl(lane, department) {
    var isVehicleLane = lane.kind === 'vehicle';
    var pairs = isVehicleLane ? lane.vehicles.map(function (v) { return { vehicle: v, driver: null }; }) : laneVehiclePairs(department, lane);
    var members = isVehicleLane ? [] : sortByOrder(lane.members);
    var open = isLaneOpen(department, lane.key);

    var countParts = [];
    if (members.length) countParts.push(members.length + '人');
    if (pairs.length) countParts.push(pairs.length + '台');
    if (!countParts.length) countParts.push('0');

    var header = h('button', {
      className: 'lane-header',
      attrs: { type: 'button' },
      onClick: function () { toggleLane(department, lane.key); }
    }, [
      h('span', { className: 'lane-title-group' }, [
        h('span', { className: 'lane-chevron', text: open ? '▼' : '▶' }),
        h('span', { className: 'lane-title', text: lane.label })
      ]),
      h('span', { className: 'lane-count', text: countParts.join(' / ') })
    ]);

    var children = [header];
    if (open) {
      var driverCol = h('div', { className: 'driver-tags' });
      members.forEach(function (s) { driverCol.appendChild(driverTag(s)); });

      var vehicleCol = h('div', { className: 'vehicle-tags' });
      pairs.forEach(function (p) { vehicleCol.appendChild(vehicleTag(p.vehicle, p.driver, lane)); });

      children.push(h('div', { className: 'site-group' }, [driverCol, siteGroupTag(lane, department), vehicleCol]));
    }
    return h('div', { className: 'site-lane ' + laneColorClass(lane, department) }, children);
  }

  function renderDepartment(containerId, department) {
    var container = document.getElementById(containerId);
    container.innerHTML = '';
    var lanes = buildDepartmentLanes(department);
    if (!lanes.length) {
      container.appendChild(h('p', { className: 'lane-empty-msg', text: '本日の登録がありません。' }));
      return;
    }
    lanes.forEach(function (lane) {
      container.appendChild(buildLaneEl(lane, department));
    });
  }

  // ---- 個々の札(タグ) ----
  // 運転手(作業員)の名前札。出勤=白、退勤=赤。氏名黒塗りモードの
  // 時は、文字を一切描画せず札全体を黒くする(透けを防ぐ)。
  function driverTag(s) {
    var dept = effectiveDisplayDept(s);
    var deptClass = dept === 'unyu' ? 'dept-unyu' : 'dept-doboku';
    return h('button', {
      className: 'tag tag-name ' + deptClass + ' ' + (s.attendance === 'present' ? 'is-present' : 'is-absent') + (namesMasked ? ' is-masked' : ''),
      attrs: { type: 'button' },
      onClick: function () {
        if (dept === 'unyu') openDispatchEditMenu(s.id);
        else openDobokuMenu(s.id);
      }
    }, [h('span', { className: 'tag-name-text', html: namesMasked ? '' : verticalHtml(s.name) })]);
  }

  // ダンプ(車両)札。現場グループの右側に並ぶ。
  function vehicleTag(v, driver, lane) {
    var warn = v.status !== 'available';
    var parkedNoDriver = !driver && lane.kind === 'site' && isVehicleParkedWithoutDriver(v);
    var overrideTag = (driver && findAssignmentForStaff(driver.id) && v.id !== driver.normalVehicleId && lane.kind === 'site')
      ? h('span', { className: 'tag-badge', text: '本日のみ' }) : null;
    return h('button', {
      className: 'tag tag-info' + (warn ? ' is-warning' : '') + (parkedNoDriver ? ' is-unset' : ''),
      attrs: { type: 'button' },
      onClick: function () {
        if (driver) {
          if (lane.kind === 'site') { openDispatchEditMenu(driver.id); return; }
          openVehicleStatusStandalone(v.id);
          return;
        }
        if (parkedNoDriver) { openParkedVehicleMenu(v.id, lane.key); return; }
        openVehicleStatusStandalone(v.id);
      }
    }, [
      h('span', { className: 'tag-caption', html: verticalHtml(driver ? 'ダンプ' : '車両') }),
      h('span', { className: 'tag-value', html: verticalHtml(v.displayName) }),
      warn ? h('span', { className: 'tag-badge tag-badge-warning', text: VEHICLE_STATUS_LABELS[v.status] }) : null,
      parkedNoDriver ? h('span', { className: 'tag-badge', text: '運転手未定' }) : null,
      overrideTag
    ]);
  }

  function isVehicleParkedWithoutDriver(vehicle) {
    return !!vehicle.todayGroupId && !findAssignmentForVehicle(vehicle.id);
  }

  // 配置グループ中央の現場名札。実在の配置枠(kind==='site')だけ
  // タップでき、その配置枠全体の編集メニューを開く。
  function siteGroupTag(lane, department) {
    var clickable = lane.kind === 'site';
    return h(clickable ? 'button' : 'div', {
      className: 'tag tag-site' + (clickable ? '' : ' tag-site-static'),
      attrs: clickable ? { type: 'button' } : {},
      onClick: clickable ? function () { openGroupEditMenu(department, lane.key); } : undefined
    }, [h('span', { className: 'tag-name-text', html: verticalHtml(lane.label) })]);
  }

  // ============================================================
  // 事務部門: 現場・ダンプを持たない、氏名+出退勤のみのシンプルな一覧。
  // ============================================================
  function officeTag(s) {
    return h('button', {
      className: 'tag tag-name dept-office ' + (s.attendance === 'present' ? 'is-present' : 'is-absent') + (namesMasked ? ' is-masked' : ''),
      attrs: { type: 'button' },
      onClick: function () { openOfficeMenu(s.id); }
    }, [h('span', { className: 'tag-name-text', html: namesMasked ? '' : verticalHtml(s.name) })]);
  }

  function renderOffice() {
    var container = document.getElementById('office-list');
    if (!container) return;
    container.innerHTML = '';
    var list = sortByOrder(state.staff.filter(function (s) { return s.department === 'office' && s.active !== false; }));
    if (!list.length) {
      container.appendChild(h('p', { className: 'office-empty-msg', text: '事務員が登録されていません。' }));
      return;
    }
    list.forEach(function (s) { container.appendChild(officeTag(s)); });
  }

  function openOfficeMenu(staffId) {
    openModal(function (panel, close) {
      buildOfficeMenuContent(panel, staffId, close);
    });
  }

  function buildOfficeMenuContent(panel, staffId, close) {
    panel.innerHTML = '';
    var s = findStaff(staffId);
    panel.appendChild(modalHeader(s.name + ' さん', '出勤・退勤を選択してください'));
    var body = h('div', { className: 'modal-body big-choice-list' });
    body.appendChild(h('button', {
      className: 'choice-btn choice-present' + (s.attendance === 'present' ? ' is-current' : ''),
      attrs: { type: 'button' },
      onClick: function () { handleAttendanceChoice(panel, staffId, close, 'present'); }
    }, [
      h('span', { className: 'choice-text', text: '出勤' }),
      s.attendance === 'present' ? h('span', { className: 'current-badge', text: '現在' }) : null
    ]));
    body.appendChild(h('button', {
      className: 'choice-btn choice-absent' + (s.attendance === 'absent' ? ' is-current' : ''),
      attrs: { type: 'button' },
      onClick: function () { handleAttendanceChoice(panel, staffId, close, 'absent'); }
    }, [
      h('span', { className: 'choice-text', text: '退勤' }),
      s.attendance === 'absent' ? h('span', { className: 'current-badge', text: '現在' }) : null
    ]));
    panel.appendChild(body);
    panel.appendChild(cancelBar(close));
  }

  // ============================================================
  // モーダル基盤
  // ============================================================
  function openModal(builder) {
    var root = document.getElementById('modal-root');
    root.innerHTML = '';
    root.classList.remove('hidden');
    root.setAttribute('aria-hidden', 'false');

    var overlay = h('div', { className: 'modal-overlay' });
    var panel = h('div', { className: 'modal-panel' });
    overlay.appendChild(panel);
    root.appendChild(overlay);

    overlay.addEventListener('click', function (e) {
      if (e.target === overlay) closeModal();
    });

    builder(panel, closeModal);
  }

  function closeModal() {
    var root = document.getElementById('modal-root');
    root.classList.add('hidden');
    root.setAttribute('aria-hidden', 'true');
    root.innerHTML = '';
  }

  function modalHeader(title, subtitle) {
    var children = [h('h2', { className: 'modal-title', text: title })];
    if (subtitle) children.push(h('p', { className: 'modal-subtitle', text: subtitle }));
    return h('div', { className: 'modal-header' }, children);
  }

  function cancelBar(close) {
    return h('div', { className: 'modal-footer' }, [
      h('button', { className: 'cancel-btn', text: 'キャンセル', attrs: { type: 'button' }, onClick: close })
    ]);
  }

  // 部門絞り込みなど、タップだけで切り替える丸みのあるチップ行
  // (従業員管理・出退勤記録で使用)。プルダウンは使わない。
  function filterChipRow(options, currentKey, onPick) {
    var row = h('div', { className: 'filter-chip-row' });
    options.forEach(function (opt) {
      row.appendChild(h('button', {
        className: 'filter-chip' + (opt.key === currentKey ? ' is-active' : ''),
        attrs: { type: 'button' },
        text: opt.label,
        onClick: function () { onPick(opt.key); }
      }));
    });
    return row;
  }

  // ============================================================
  // 出勤・退勤の確定(土木・運輸・事務すべてで共通)
  // ============================================================
  function handleAttendanceChoice(panel, staffId, close, status) {
    var s = findStaff(staffId);
    if (s.attendance === status) {
      buildAttendanceConfirmContent(panel, staffId, close, status);
    } else {
      setAttendance(staffId, status);
      if (status === 'absent') buildOvertimeChoiceContent(panel, staffId, close);
      else close();
    }
  }

  function buildAttendanceConfirmContent(panel, staffId, close, status) {
    panel.innerHTML = '';
    var label = status === 'present' ? '出勤' : '退勤';
    panel.appendChild(modalHeader('確認', '現在すでに' + label + '状態です。\nもう一度、' + label + '時刻を記録しますか？'));

    var body = h('div', { className: 'modal-body big-choice-list' });
    body.appendChild(h('button', {
      className: 'choice-btn choice-add',
      attrs: { type: 'button' },
      text: '記録する',
      onClick: function () {
        setAttendance(staffId, status);
        if (status === 'absent') buildOvertimeChoiceContent(panel, staffId, close);
        else close();
      }
    }));
    panel.appendChild(body);
    panel.appendChild(cancelBar(close));
  }

  // ============================================================
  // 残業の自己申告: 退勤を記録した直後に、その日の残業時間を
  // 0.5時間刻みでタップして選んでもらう。直前に記録した退勤ログに
  // 時間を書き足すだけで、出退勤の記録自体は変更しない。
  // ============================================================
  var OVERTIME_HOUR_OPTIONS = (function () {
    var opts = [];
    for (var i = 0; i <= 20; i++) opts.push(i * 0.5);
    return opts;
  })();

  function buildOvertimeChoiceContent(panel, staffId, close) {
    panel.innerHTML = '';
    var s = findStaff(staffId);
    panel.appendChild(modalHeader(s.name + ' さんの残業申告', '今日の残業時間をタップして選んでください(0.5時間単位)'));

    var body = h('div', { className: 'modal-body overtime-grid scroll-list' });
    OVERTIME_HOUR_OPTIONS.forEach(function (hrs) {
      body.appendChild(h('button', {
        className: 'overtime-btn' + (hrs === 0 ? ' overtime-btn-zero' : ''),
        attrs: { type: 'button' },
        text: hrs === 0 ? '残業なし' : hrs + '時間',
        onClick: function () { recordOvertime(s, hrs); close(); }
      }));
    });
    panel.appendChild(body);
    panel.appendChild(h('div', { className: 'modal-footer' }, [
      h('button', { className: 'cancel-btn', text: '申告しない', attrs: { type: 'button' }, onClick: close })
    ]));
  }

  function recordOvertime(staff, hours) {
    var lastClockOut = state.attendanceLogs.filter(function (r) { return r.personId === staff.id && r.action === 'clockOut'; }).slice(-1)[0];
    if (lastClockOut) lastClockOut.overtimeHours = hours;
    persist();
    showToast(staff.name, hours > 0 ? '残業' + hours + '時間を記録しました' : '残業なしを記録しました');
  }

  // 新規現場フォームの本体部分。保存・戻る時の動作は呼び出し元が
  // onSaved(site)/onBack で指定する。
  function buildNewSiteFormCore(panel, onSaved, onBack) {
    panel.innerHTML = '';
    panel.appendChild(modalHeader('新規現場を追加', '現場名を入力し、区分を選んでください'));

    var body = h('div', { className: 'modal-body' });
    var errorMsg = h('p', { className: 'form-error hidden' });
    var input = h('input', {
      className: 'form-input',
      attrs: { type: 'text', inputmode: 'text', autocomplete: 'off', placeholder: '例：〇〇現場' }
    });

    body.appendChild(h('label', { className: 'form-label', text: '現場名' }));
    body.appendChild(input);
    body.appendChild(errorMsg);
    body.appendChild(h('label', { className: 'form-label', text: '現場区分' }));

    var selectedCategory = null;
    var categoryRow = h('div', { className: 'category-row' });
    var categoryBtns = {};
    [['doboku', '土木'], ['unyu', '運輸'], ['common', '共通']].forEach(function (pair) {
      var key = pair[0], labelText = pair[1];
      var btn = h('button', {
        className: 'category-btn',
        attrs: { type: 'button' },
        text: labelText,
        onClick: function () {
          selectedCategory = key;
          Object.keys(categoryBtns).forEach(function (k) {
            categoryBtns[k].classList.toggle('is-selected', k === key);
          });
        }
      });
      categoryBtns[key] = btn;
      categoryRow.appendChild(btn);
    });
    body.appendChild(categoryRow);

    panel.appendChild(body);

    var footer = h('div', { className: 'modal-footer two-col' });
    footer.appendChild(h('button', { className: 'cancel-btn', text: '戻る', attrs: { type: 'button' }, onClick: onBack }));
    footer.appendChild(h('button', {
      className: 'save-btn',
      text: '保存',
      attrs: { type: 'button' },
      onClick: function () {
        if (!input.value.trim()) {
          errorMsg.textContent = '現場名を入力してください。';
          errorMsg.classList.remove('hidden');
          return;
        }
        if (!selectedCategory) {
          errorMsg.textContent = '現場区分を選択してください。';
          errorMsg.classList.remove('hidden');
          return;
        }
        var result = addSite(input.value, selectedCategory);
        if (!result.ok) {
          errorMsg.textContent = '同じ名前の現場が既に登録されています。';
          errorMsg.classList.remove('hidden');
          return;
        }
        onSaved(result.site);
      }
    }));
    panel.appendChild(footer);

    input.focus();
  }

  // ============================================================
  // 配置枠を選ぶ共通部品: 現場を選ぶ → 既存の配置枠か新規かを選ぶ。
  // 個人の「配置枠を変更」・配車ウィザードの両方から使う。
  // onPicked(groupId, site) が呼ばれる。
  // ============================================================
  function buildSitePickerForGroup(panel, department, close, onPicked, onBack) {
    panel.innerHTML = '';
    panel.appendChild(modalHeader('現場を選択', '配置する現場をタップしてください'));
    var body = h('div', { className: 'modal-body scroll-list' });
    relevantSites(department).forEach(function (site) {
      body.appendChild(h('button', {
        className: 'list-btn site-item', attrs: { type: 'button' },
        onClick: function () { buildGroupChoicePicker(panel, department, site, close, onPicked, onBack); }
      }, [h('span', { className: 'list-btn-text', text: site.name })]));
    });
    body.appendChild(h('button', {
      className: 'list-btn site-item', attrs: { type: 'button' },
      onClick: function () { onPicked(null, null); }
    }, [h('span', { className: 'list-btn-text', text: '現場未定' })]));
    panel.appendChild(body);
    panel.appendChild(h('button', {
      className: 'choice-btn choice-add', attrs: { type: 'button' }, text: '＋ 新規現場を追加',
      onClick: function () {
        buildNewSiteFormCore(panel,
          function (site) { buildGroupChoicePicker(panel, department, site, close, onPicked, onBack); },
          function () { buildSitePickerForGroup(panel, department, close, onPicked, onBack); });
      }
    }));
    panel.appendChild(cancelBar(close));
  }

  function buildGroupChoicePicker(panel, department, site, close, onPicked, onBack) {
    panel.innerHTML = '';
    panel.appendChild(modalHeader(site.name + 'の配置先を選んでください', '既存の配置枠へ追加するか、新しい配置枠を作るかを選んでください'));
    var body = h('div', { className: 'modal-body scroll-list' });
    var existing = groupsForSite(site.id, department, true);
    existing.forEach(function (g) {
      body.appendChild(h('button', {
        className: 'list-btn site-item', attrs: { type: 'button' },
        onClick: function () { onPicked(g.id, site); }
      }, [
        h('span', { className: 'list-btn-text', text: g.displayLabel + 'へ追加' }),
        h('span', { className: 'list-btn-tag', text: groupCountsLabel(g.id, department) })
      ]));
    });
    panel.appendChild(body);
    panel.appendChild(h('button', {
      className: 'choice-btn choice-add', attrs: { type: 'button' }, text: '＋ 新しい' + site.name + 'の配置枠を作る',
      onClick: function () {
        var g = createDispatchGroup(site.id, department);
        site.usageCount = (site.usageCount || 0) + 1;
        onPicked(g.id, site);
      }
    }));
    var footer = h('div', { className: 'modal-footer two-col' });
    footer.appendChild(h('button', { className: 'cancel-btn', text: '戻る', attrs: { type: 'button' }, onClick: function () { buildSitePickerForGroup(panel, department, close, onPicked, onBack); } }));
    footer.appendChild(h('button', { className: 'cancel-btn', text: 'キャンセル', attrs: { type: 'button' }, onClick: close }));
    panel.appendChild(footer);
  }

  // ============================================================
  // 土木メニュー(名前をタップした時に表示)
  // ============================================================
  function openDobokuMenu(staffId) {
    openModal(function (panel, close) {
      buildDobokuMenuContent(panel, staffId, close);
    });
  }

  // 従業員本人が自分の名前札をタップした時の画面。出勤・退勤の切替
  // だけを行い、配置枠の変更などの管理操作はここには置かない
  // (現場の組み替えは、現場名札(中央の札)からの配置枠編集メニューで
  // 黒瀬大祐さん(土木)・会長(運輸)など管理側が行う)。
  function buildDobokuMenuContent(panel, staffId, close) {
    panel.innerHTML = '';
    var s = findStaff(staffId);
    var g = s.todayGroupId ? findGroup(s.todayGroupId) : null;
    panel.appendChild(modalHeader(s.name + ' さん', '出勤・退勤を選択してください'));
    panel.appendChild(h('div', {
      className: 'current-line',
      text: '現在の配置：' + (g ? g.displayLabel : '現場未定')
    }));

    var body = h('div', { className: 'modal-body big-choice-list' });

    body.appendChild(h('button', {
      className: 'choice-btn choice-present' + (s.attendance === 'present' ? ' is-current' : ''),
      attrs: { type: 'button' },
      onClick: function () { handleAttendanceChoice(panel, staffId, close, 'present'); }
    }, [
      h('span', { className: 'choice-text', text: '出勤' }),
      s.attendance === 'present' ? h('span', { className: 'current-badge', text: '現在' }) : null
    ]));

    body.appendChild(h('button', {
      className: 'choice-btn choice-absent' + (s.attendance === 'absent' ? ' is-current' : ''),
      attrs: { type: 'button' },
      onClick: function () { handleAttendanceChoice(panel, staffId, close, 'absent'); }
    }, [
      h('span', { className: 'choice-text', text: '退勤' }),
      s.attendance === 'absent' ? h('span', { className: 'current-badge', text: '現在' }) : null
    ]));

    panel.appendChild(body);
    panel.appendChild(cancelBar(close));
  }

  // ============================================================
  // 運輸: 従業員本人が自分の名前・ダンプ札をタップした時の画面。
  // 土木側と同じく、出勤・退勤の切替だけを行う(配置枠やダンプの
  // 組合せの変更は、現場名札(中央の札)からの配置枠編集メニューで
  // 会長など管理側が行う)。
  // ============================================================
  function openDispatchEditMenu(staffId) {
    openModal(function (panel, close) {
      buildDispatchEditMenuContent(panel, staffId, close);
    });
  }

  function buildDispatchEditMenuContent(panel, staffId, close) {
    panel.innerHTML = '';
    var s = findStaff(staffId);
    var g = s.todayGroupId ? findGroup(s.todayGroupId) : null;
    var asn = findAssignmentForStaff(staffId);
    var vehicle = asn ? findVehicle(asn.vehicleId) : null;

    panel.appendChild(modalHeader(s.name + ' さん', '出勤・退勤を選択してください'));
    panel.appendChild(h('div', {
      className: 'current-line',
      text: '配置枠：' + (g ? g.displayLabel : '現場未定') + ' ／ ダンプ：' + (vehicle ? vehicle.displayName : '未割当')
    }));

    var body = h('div', { className: 'modal-body big-choice-list' });

    body.appendChild(h('button', {
      className: 'choice-btn choice-present' + (s.attendance === 'present' ? ' is-current' : ''),
      attrs: { type: 'button' },
      onClick: function () { handleAttendanceChoice(panel, staffId, close, 'present'); }
    }, [
      h('span', { className: 'choice-text', text: '出勤' }),
      s.attendance === 'present' ? h('span', { className: 'current-badge', text: '現在' }) : null
    ]));
    body.appendChild(h('button', {
      className: 'choice-btn choice-absent' + (s.attendance === 'absent' ? ' is-current' : ''),
      attrs: { type: 'button' },
      onClick: function () { handleAttendanceChoice(panel, staffId, close, 'absent'); }
    }, [
      h('span', { className: 'choice-text', text: '退勤' }),
      s.attendance === 'absent' ? h('span', { className: 'current-badge', text: '現在' }) : null
    ]));

    panel.appendChild(body);
    panel.appendChild(cancelBar(close));
  }

  // ある運転手のダンプを、登録されている全てのダンプから選び直す。
  // 配置枠編集メニュー(現場名札からの「組合せを変更」)専用。
  // その人が今どの配置枠にいるかは変えず、ダンプの組合せだけ変える。
  function buildVehiclePickerForStaff(panel, staffId, close, onBack) {
    panel.innerHTML = '';
    var s = findStaff(staffId);
    panel.appendChild(modalHeader(s.name + ' さんの乗車ダンプ選択', '登録済みの車両からタップで選んでください'));

    var currentAsn = findAssignmentForStaff(staffId);
    var currentVid = currentAsn ? currentAsn.vehicleId : null;
    var normalVehicle = s.normalVehicleId ? findVehicle(s.normalVehicleId) : null;

    var body = h('div', { className: 'modal-body scroll-list' });
    var vehicles = sortByOrder(state.vehicles.filter(function (v) { return v.active !== false; }));
    vehicles.forEach(function (v) {
      var usable = v.status === 'available';
      var selected = currentVid === v.id;
      var holderAsn = usable ? findAssignmentForVehicle(v.id) : null;
      var holder = holderAsn && holderAsn.staffId !== staffId ? findStaff(holderAsn.staffId) : null;
      var lines = [h('span', { className: 'list-btn-text', text: v.displayName })];
      if (!usable) lines.push(h('span', { className: 'status-badge status-' + v.status, text: VEHICLE_STATUS_LABELS[v.status] }));
      if (usable && v.id === s.normalVehicleId) lines.push(h('span', { className: 'list-btn-tag', text: '通常のダンプ' }));
      if (usable && holder) lines.push(h('span', { className: 'list-btn-tag', text: holder.name + 'さん使用中' }));
      if (selected) lines.push(h('span', { className: 'current-badge', text: '選択中' }));
      body.appendChild(h('button', {
        className: 'list-btn vehicle-item' + (selected ? ' is-selected' : '') + (usable ? '' : ' is-disabled'),
        attrs: { type: 'button' }, disabled: !usable,
        onClick: function () {
          if (!usable) return;
          if (!s.todayGroupId) { openModal(function () {}); closeModal(); return; }
          assignStaffToGroup(staffId, s.todayGroupId, v.id);
          persist(); renderAll(); close();
          showToast(s.name, v.displayName + 'に乗車を変更しました');
        }
      }, lines));
    });
    panel.appendChild(body);

    if (normalVehicle && currentVid !== s.normalVehicleId) {
      panel.appendChild(h('button', {
        className: 'choice-btn choice-neutral', attrs: { type: 'button' }, text: '通常ダンプ(' + normalVehicle.displayName + ')に戻す',
        onClick: function () {
          if (!s.todayGroupId) return;
          assignStaffToGroup(staffId, s.todayGroupId, s.normalVehicleId);
          persist(); renderAll(); close();
        }
      }));
    }

    var footer = h('div', { className: 'modal-footer two-col' });
    footer.appendChild(h('button', { className: 'cancel-btn', text: '戻る', attrs: { type: 'button' }, onClick: onBack }));
    footer.appendChild(h('button', { className: 'cancel-btn', text: 'キャンセル', attrs: { type: 'button' }, onClick: close }));
    panel.appendChild(footer);
  }

  // ============================================================
  // 保存データの消去(ブラウザに保存された古いデータを最新の初期データへ戻す)
  // ============================================================
  function openResetDataConfirm() {
    openModal(function (panel, close) {
      panel.appendChild(modalHeader(
        '保存データを消去しますか？',
        '出退勤・配車の記録を含め、このブラウザに保存されているデータをすべて消去し、最新の初期データに戻します。この操作は取り消せません。'
      ));
      var body = h('div', { className: 'modal-body big-choice-list' });
      body.appendChild(h('button', {
        className: 'choice-btn choice-absent', attrs: { type: 'button' }, text: '消去して初期データに戻す',
        onClick: function () {
          Storage.clearState();
          state = createSeedState();
          persist();
          close();
          renderAll();
          showToast('保存データを消去しました', '最新の初期データに戻りました');
        }
      }));
      panel.appendChild(body);
      var footer = h('div', { className: 'modal-footer' });
      footer.appendChild(h('button', { className: 'cancel-btn', text: 'キャンセル', attrs: { type: 'button' }, onClick: close }));
      panel.appendChild(footer);
    });
  }

  // ============================================================
  // 車両管理(車検・整備・故障・使用停止)
  // ============================================================
  function openVehicleAdmin() {
    openModal(function (panel, close) {
      buildVehicleAdminContent(panel, close);
    });
  }

  function openVehicleStatusStandalone(vehicleId) {
    openModal(function (panel, close) {
      buildVehicleStatusContent(panel, vehicleId, close, null);
    });
  }

  function buildVehicleAdminContent(panel, close) {
    panel.innerHTML = '';
    panel.appendChild(modalHeader('車両管理', '車両をタップして状態を変更してください'));

    var body = h('div', { className: 'modal-body scroll-list' });
    var list = sortByOrder(state.vehicles.filter(function (v) { return v.active !== false; }));
    list.forEach(function (v) {
      body.appendChild(h('button', {
        className: 'list-btn vehicle-admin-item',
        attrs: { type: 'button' },
        onClick: function () {
          buildVehicleStatusContent(panel, v.id, close, function () { buildVehicleAdminContent(panel, close); });
        }
      }, [
        h('span', { className: 'list-btn-text', text: v.displayName }),
        h('span', { className: 'status-badge status-' + v.status, text: VEHICLE_STATUS_LABELS[v.status] })
      ]));
    });
    panel.appendChild(body);
    panel.appendChild(cancelBar(close));
  }

  function buildVehicleStatusContent(panel, vehicleId, close, onBack) {
    panel.innerHTML = '';
    var v = findVehicle(vehicleId);
    panel.appendChild(modalHeader(v.displayName, '車両の状態を選択してください'));

    var body = h('div', { className: 'modal-body big-choice-list' });
    VEHICLE_STATUS_ORDER.forEach(function (statusKey) {
      var current = v.status === statusKey;
      body.appendChild(h('button', {
        className: 'choice-btn status-choice status-choice-' + statusKey + (current ? ' is-current' : ''),
        attrs: { type: 'button' },
        onClick: function () {
          setVehicleStatus(vehicleId, statusKey);
          if (onBack) onBack(); else close();
        }
      }, [
        h('span', { className: 'choice-text', text: VEHICLE_STATUS_LABELS[statusKey] }),
        current ? h('span', { className: 'current-badge', text: '現在' }) : null
      ]));
    });
    panel.appendChild(body);

    if (onBack) {
      var footer = h('div', { className: 'modal-footer two-col' });
      footer.appendChild(h('button', { className: 'cancel-btn', text: '戻る', attrs: { type: 'button' }, onClick: onBack }));
      footer.appendChild(h('button', { className: 'cancel-btn', text: 'キャンセル', attrs: { type: 'button' }, onClick: close }));
      panel.appendChild(footer);
    } else {
      panel.appendChild(cancelBar(close));
    }
  }

  // 運転手なしで配置枠に駐車中のダンプ札をタップしたときのメニュー。
  function openParkedVehicleMenu(vehicleId, groupId) {
    openModal(function (panel, close) {
      buildParkedVehicleMenuContent(panel, vehicleId, groupId, close);
    });
  }

  function buildParkedVehicleMenuContent(panel, vehicleId, groupId, close) {
    panel.innerHTML = '';
    var v = findVehicle(vehicleId);
    var g = findGroup(groupId);
    panel.appendChild(modalHeader(v.displayName, '運転手が乗っていない状態で「' + (g ? g.displayLabel : '現場未定') + '」に駐車中です'));

    var body = h('div', { className: 'modal-body big-choice-list' });
    body.appendChild(h('button', {
      className: 'choice-btn choice-move', attrs: { type: 'button' }, text: '運転手を割り当てる',
      onClick: function () { buildParkedVehicleAssignDriver(panel, vehicleId, groupId, close); }
    }));
    body.appendChild(h('button', {
      className: 'choice-btn choice-neutral', attrs: { type: 'button' }, text: '現場から外す(空車に戻す)',
      onClick: function () { releaseVehicleEverywhere(vehicleId); persist(); renderAll(); close(); }
    }));
    body.appendChild(h('button', {
      className: 'choice-btn choice-move', attrs: { type: 'button' }, text: '車両状態を変更',
      onClick: function () { buildVehicleStatusContent(panel, vehicleId, close, function () { buildParkedVehicleMenuContent(panel, vehicleId, groupId, close); }); }
    }));
    panel.appendChild(body);
    panel.appendChild(cancelBar(close));
  }

  function buildParkedVehicleAssignDriver(panel, vehicleId, groupId, close) {
    panel.innerHTML = '';
    var v = findVehicle(vehicleId);
    panel.appendChild(modalHeader(v.displayName + 'の運転手を選択', 'タップして運転手を選んでください'));

    var body = h('div', { className: 'modal-body scroll-list' });
    var candidates = sortByOrder(dumpDriverCandidates());
    candidates.forEach(function (s) {
      var sGroup = s.todayGroupId ? findGroup(s.todayGroupId) : null;
      body.appendChild(h('button', {
        className: 'list-btn driver-item' + (s.attendance === 'present' ? ' is-present-driver' : ' is-absent-driver'),
        attrs: { type: 'button' },
        onClick: function () {
          if (isDriverAlreadyInOtherGroup(s, groupId)) {
            buildParkedVehicleAssignConfirm(panel, vehicleId, groupId, close, s);
          } else {
            commitParkedVehicleAssign(vehicleId, groupId, s);
            close();
          }
        }
      }, [
        h('span', { className: 'list-btn-text', text: s.name }),
        h('span', { className: 'status-badge ' + (s.attendance === 'present' ? 'status-available' : 'status-suspended'), text: s.attendance === 'present' ? '出勤' : '退勤' }),
        s.department !== 'unyu' ? h('span', { className: 'list-btn-tag', text: DEPT_LABELS[s.department] }) : null,
        sGroup ? h('span', { className: 'list-btn-tag', text: sGroup.displayLabel }) : null
      ]));
    });
    panel.appendChild(body);

    var footer = h('div', { className: 'modal-footer two-col' });
    footer.appendChild(h('button', { className: 'cancel-btn', text: '戻る', attrs: { type: 'button' }, onClick: function () { buildParkedVehicleMenuContent(panel, vehicleId, groupId, close); } }));
    footer.appendChild(h('button', { className: 'cancel-btn', text: 'キャンセル', attrs: { type: 'button' }, onClick: close }));
    panel.appendChild(footer);
  }

  function buildParkedVehicleAssignConfirm(panel, vehicleId, groupId, close, candidate) {
    panel.innerHTML = '';
    var candidateGroup = findGroup(candidate.todayGroupId);
    var targetGroup = findGroup(groupId);
    var crossDept = candidateGroup.department !== targetGroup.department;
    var message = crossDept
      ? candidate.name + 'さんは現在、' + DEPT_LABELS[candidateGroup.department] + 'の' + candidateGroup.displayLabel + 'に配置されています。\n' +
        DEPT_LABELS[targetGroup.department] + 'の' + targetGroup.displayLabel + 'へ移動しますか？'
      : candidate.name + 'さんは現在「' + candidateGroup.displayLabel + '」に登録されています。\n「' + targetGroup.displayLabel + '」へ移動しますか？';
    panel.appendChild(modalHeader('確認', message));
    var body = h('div', { className: 'modal-body big-choice-list' });
    body.appendChild(h('button', {
      className: 'choice-btn choice-add', attrs: { type: 'button' }, text: '移動する',
      onClick: function () { commitParkedVehicleAssign(vehicleId, groupId, candidate); close(); }
    }));
    panel.appendChild(body);
    panel.appendChild(h('div', { className: 'modal-footer' }, [
      h('button', { className: 'cancel-btn', text: '戻る', attrs: { type: 'button' }, onClick: function () { buildParkedVehicleAssignDriver(panel, vehicleId, groupId, close); } })
    ]));
  }

  function commitParkedVehicleAssign(vehicleId, groupId, driver) {
    assignStaffToGroup(driver.id, groupId, vehicleId);
    if (driver.attendance !== 'present') applyAttendanceChange(driver, 'present', new Date());
    persist();
    setLaneOpen(findGroup(groupId).department, groupId, true);
    renderAll();
    showToast(driver.name, findVehicle(vehicleId).displayName + 'の運転手に割り当てました');
  }

  // ============================================================
  // 配置枠全体の編集メニュー(現場名札をタップした時に表示)
  // ============================================================
  function openGroupEditMenu(department, groupId) {
    openModal(function (panel, close) {
      buildGroupEditMenuContent(panel, department, groupId, close);
    });
  }

  function buildGroupEditMenuContent(panel, department, groupId, close) {
    panel.innerHTML = '';
    var g = findGroup(groupId);
    var backHere = function () { buildGroupEditMenuContent(panel, department, groupId, close); };

    panel.appendChild(modalHeader(g.displayLabel + 'の編集', '変更する項目を選んでください'));
    panel.appendChild(h('div', { className: 'current-line', text: groupCountsLabel(groupId, department) }));

    var body = h('div', { className: 'modal-body big-choice-list' });
    body.appendChild(h('button', {
      className: 'choice-btn choice-move', attrs: { type: 'button' }, text: department === 'unyu' ? '運転手を追加' : '作業員を追加',
      onClick: function () { buildGroupAddStaff(panel, department, groupId, close, backHere); }
    }));
    body.appendChild(h('button', {
      className: 'choice-btn choice-move', attrs: { type: 'button' }, text: department === 'unyu' ? '運転手を外す' : '作業員を外す',
      onClick: function () { buildGroupRemoveStaff(panel, department, groupId, close, backHere); }
    }));
    if (department === 'unyu') {
      body.appendChild(h('button', {
        className: 'choice-btn choice-move', attrs: { type: 'button' }, text: 'ダンプを追加',
        onClick: function () { buildGroupAddVehicle(panel, groupId, close, backHere); }
      }));
      body.appendChild(h('button', {
        className: 'choice-btn choice-move', attrs: { type: 'button' }, text: 'ダンプを外す',
        onClick: function () { buildGroupRemoveVehicle(panel, groupId, close, backHere); }
      }));
      body.appendChild(h('button', {
        className: 'choice-btn choice-move', attrs: { type: 'button' }, text: '運転手とダンプの組合せを変更',
        onClick: function () { buildGroupRepairPicker(panel, groupId, close, backHere); }
      }));
    }
    body.appendChild(h('button', {
      className: 'choice-btn choice-move', attrs: { type: 'button' }, text: '別の配置枠へ移動',
      onClick: function () {
        buildSitePickerForGroup(panel, department, close, function (targetGroupId) {
          if (!targetGroupId || targetGroupId === groupId) { backHere(); return; }
          moveGroupContents(groupId, targetGroupId);
          persist();
          setLaneOpen(department, targetGroupId, true);
          renderAll();
          showToast(findGroup(targetGroupId).displayLabel + 'へ', '配置枠の内容を移動しました');
          close();
        }, backHere);
      }
    }));
    body.appendChild(h('button', {
      className: 'choice-btn choice-absent', attrs: { type: 'button' }, text: '配置枠を終了',
      onClick: function () { buildGroupEndConfirm(panel, groupId, close, backHere); }
    }));
    panel.appendChild(body);
    panel.appendChild(cancelBar(close));
  }

  function buildGroupAddStaff(panel, department, groupId, close, onBack) {
    var selected = [];
    function render() {
      panel.innerHTML = '';
      var g = findGroup(groupId);
      panel.appendChild(modalHeader((department === 'unyu' ? '運転手' : '作業員') + 'を追加', g.displayLabel + 'へ追加する人をタップして選んでください(複数選択可)'));
      panel.appendChild(h('div', { className: 'current-line', text: '選択中：' + selected.length + '人' }));
      var body = h('div', { className: 'modal-body scroll-list' });
      var pool = department === 'unyu' ? dumpDriverCandidates() : state.staff.filter(function (s) { return s.department === 'doboku' && s.active !== false; });
      var candidates = sortByOrder(pool.filter(function (s) { return s.todayGroupId !== groupId; }));
      candidates.forEach(function (s) {
        var isSel = selected.indexOf(s.id) !== -1;
        var sGroup = s.todayGroupId ? findGroup(s.todayGroupId) : null;
        body.appendChild(h('button', {
          className: 'list-btn driver-item select-item' + (isSel ? ' is-selected' : '') + (s.attendance === 'present' ? ' is-present-driver' : ' is-absent-driver'),
          attrs: { type: 'button' },
          onClick: function () {
            var idx = selected.indexOf(s.id);
            if (idx !== -1) { selected.splice(idx, 1); render(); return; }
            if (isDriverAlreadyInOtherGroup(s, groupId)) {
              var curGroup = s.todayGroupId ? findGroup(s.todayGroupId) : null;
              var crossDept = curGroup && curGroup.department !== department;
              var message = crossDept
                ? s.name + 'さんは現在、' + DEPT_LABELS[curGroup.department] + 'の' + curGroup.displayLabel + 'に配置されています。\n' +
                  DEPT_LABELS[department] + 'の' + g.displayLabel + 'へ移動しますか？'
                : s.name + 'さんは現在「' + (curGroup ? curGroup.displayLabel : '現場未定') + '」に登録されています。\n「' + g.displayLabel + '」へ移動しますか？';
              panel.innerHTML = '';
              panel.appendChild(modalHeader('確認', message));
              var cbody = h('div', { className: 'modal-body big-choice-list' });
              cbody.appendChild(h('button', { className: 'choice-btn choice-add', attrs: { type: 'button' }, text: '移動する', onClick: function () { selected.push(s.id); render(); } }));
              panel.appendChild(cbody);
              panel.appendChild(h('div', { className: 'modal-footer' }, [h('button', { className: 'cancel-btn', text: '戻る', attrs: { type: 'button' }, onClick: render })]));
              return;
            }
            selected.push(s.id); render();
          }
        }, [
          h('span', { className: 'select-mark', text: isSel ? '■' : '□' }),
          h('span', { className: 'list-btn-text', text: s.name }),
          h('span', { className: 'status-badge ' + (s.attendance === 'present' ? 'status-available' : 'status-suspended'), text: s.attendance === 'present' ? '出勤' : '退勤' }),
          (s.department !== department && !isSel) ? h('span', { className: 'list-btn-tag', text: DEPT_LABELS[s.department] }) : null,
          (sGroup && !isSel) ? h('span', { className: 'list-btn-tag', text: sGroup.displayLabel }) : null
        ]));
      });
      panel.appendChild(body);
      panel.appendChild(h('button', {
        className: 'choice-btn choice-add', attrs: { type: 'button' }, text: '追加する',
        onClick: function () { if (selected.length) commitGroupAddStaff(department, groupId, selected, panel, close); }
      }));
      var footer = h('div', { className: 'modal-footer two-col' });
      footer.appendChild(h('button', { className: 'cancel-btn', text: '戻る', attrs: { type: 'button' }, onClick: onBack }));
      footer.appendChild(h('button', { className: 'cancel-btn', text: 'キャンセル', attrs: { type: 'button' }, onClick: close }));
      panel.appendChild(footer);
    }
    render();
  }

  function commitGroupAddStaff(department, groupId, staffIds, panel, close) {
    var absentOnes = staffIds.map(findStaff).filter(function (s) { return s.attendance === 'absent'; });
    if (!absentOnes.length) { finalizeGroupAddStaff(department, groupId, staffIds, false); close(); return; }
    panel.innerHTML = '';
    var names = absentOnes.map(function (s) { return s.name; }).join('、');
    panel.appendChild(modalHeader('出退勤の確認', names + 'さんは現在「退勤」状態です。'));
    var body = h('div', { className: 'modal-body big-choice-list' });
    body.appendChild(h('button', { className: 'choice-btn choice-add', attrs: { type: 'button' }, text: '出勤を記録して追加', onClick: function () { finalizeGroupAddStaff(department, groupId, staffIds, true); close(); } }));
    body.appendChild(h('button', { className: 'choice-btn choice-neutral', attrs: { type: 'button' }, text: '追加だけ登録', onClick: function () { finalizeGroupAddStaff(department, groupId, staffIds, false); close(); } }));
    panel.appendChild(body);
    panel.appendChild(cancelBar(close));
  }

  // 通常ダンプが空いていれば自動で組み合わせ、それ以外は運転手だけ追加する。
  function finalizeGroupAddStaff(department, groupId, staffIds, markPresent) {
    var now = new Date();
    staffIds.forEach(function (id) {
      var s = findStaff(id);
      var vehicleId = null;
      if (department === 'unyu' && s.normalVehicleId) {
        var v = findVehicle(s.normalVehicleId);
        if (v && v.active !== false && v.status === 'available' && !findAssignmentForVehicle(v.id)) vehicleId = v.id;
      }
      assignStaffToGroup(id, groupId, vehicleId);
      if (markPresent && s.attendance !== 'present') applyAttendanceChange(s, 'present', now);
    });
    var g = findGroup(groupId);
    var site = findSite(g.siteId);
    if (site) site.usageCount = (site.usageCount || 0) + staffIds.length;
    persist();
    setLaneOpen(department, groupId, true);
    renderAll();
    showToast(g.displayLabel + 'へ', staffIds.length + '人を追加しました');
  }

  function buildGroupRemoveStaff(panel, department, groupId, close, onBack) {
    var selected = [];
    function render() {
      panel.innerHTML = '';
      var g = findGroup(groupId);
      var members = sortByOrder(groupMembers(groupId));
      panel.appendChild(modalHeader((department === 'unyu' ? '運転手' : '作業員') + 'を外す', g.displayLabel + 'から外す人をタップして選んでください(複数選択可)'));
      panel.appendChild(h('div', { className: 'current-line', text: '選択中：' + selected.length + '人' }));
      var body = h('div', { className: 'modal-body scroll-list' });
      if (!members.length) body.appendChild(h('p', { className: 'record-empty', text: 'この配置枠には誰もいません。' }));
      members.forEach(function (s) {
        var isSel = selected.indexOf(s.id) !== -1;
        body.appendChild(h('button', {
          className: 'list-btn driver-item select-item' + (isSel ? ' is-selected' : ''),
          attrs: { type: 'button' },
          onClick: function () {
            var idx = selected.indexOf(s.id);
            if (idx !== -1) selected.splice(idx, 1); else selected.push(s.id);
            render();
          }
        }, [
          h('span', { className: 'select-mark', text: isSel ? '■' : '□' }),
          h('span', { className: 'list-btn-text', text: s.name })
        ]));
      });
      panel.appendChild(body);
      panel.appendChild(h('button', {
        className: 'choice-btn choice-absent', attrs: { type: 'button' }, text: '外す',
        onClick: function () {
          if (!selected.length) return;
          selected.forEach(function (id) { removeStaffFromGroup(findStaff(id)); });
          persist(); renderAll();
          showToast(g.displayLabel, selected.length + '人を外しました');
          close();
        }
      }));
      var footer = h('div', { className: 'modal-footer two-col' });
      footer.appendChild(h('button', { className: 'cancel-btn', text: '戻る', attrs: { type: 'button' }, onClick: onBack }));
      footer.appendChild(h('button', { className: 'cancel-btn', text: 'キャンセル', attrs: { type: 'button' }, onClick: close }));
      panel.appendChild(footer);
    }
    render();
  }

  function buildGroupAddVehicle(panel, groupId, close, onBack) {
    var selected = [];
    function render() {
      panel.innerHTML = '';
      var g = findGroup(groupId);
      panel.appendChild(modalHeader('ダンプを追加', g.displayLabel + 'へ追加するダンプをタップして選んでください(複数選択可)'));
      panel.appendChild(h('div', { className: 'current-line', text: '選択中：' + selected.length + '台' }));
      var body = h('div', { className: 'modal-body scroll-list' });
      var vehicles = sortByOrder(state.vehicles.filter(function (v) { return v.active !== false; }));
      vehicles.forEach(function (v) {
        var usable = v.status === 'available';
        var asn = findAssignmentForVehicle(v.id);
        var curGroupId = asn ? asn.groupId : v.todayGroupId;
        if (curGroupId === groupId) return;
        var isSel = selected.indexOf(v.id) !== -1;
        var lines = [h('span', { className: 'select-mark', text: isSel ? '■' : '□' }), h('span', { className: 'list-btn-text', text: v.displayName })];
        if (!usable) lines.push(h('span', { className: 'status-badge status-' + v.status, text: VEHICLE_STATUS_LABELS[v.status] }));
        if (usable && curGroupId) { var cg = findGroup(curGroupId); lines.push(h('span', { className: 'list-btn-tag', text: (cg ? cg.displayLabel : '') + 'で使用中' })); }
        body.appendChild(h('button', {
          className: 'list-btn vehicle-item select-item' + (isSel ? ' is-selected' : '') + (usable ? '' : ' is-disabled'),
          attrs: { type: 'button' }, disabled: !usable,
          onClick: function () {
            if (!usable) return;
            var idx = selected.indexOf(v.id);
            if (idx !== -1) { selected.splice(idx, 1); render(); return; }
            if (curGroupId) {
              var cg2 = findGroup(curGroupId);
              panel.innerHTML = '';
              panel.appendChild(modalHeader('確認', v.displayName + 'は現在「' + (cg2 ? cg2.displayLabel : '') + '」で使用中です。\n「' + g.displayLabel + '」へ移動しますか？'));
              var cbody = h('div', { className: 'modal-body big-choice-list' });
              cbody.appendChild(h('button', { className: 'choice-btn choice-add', attrs: { type: 'button' }, text: '移動する', onClick: function () { selected.push(v.id); render(); } }));
              panel.appendChild(cbody);
              panel.appendChild(h('div', { className: 'modal-footer' }, [h('button', { className: 'cancel-btn', text: '戻る', attrs: { type: 'button' }, onClick: render })]));
              return;
            }
            selected.push(v.id); render();
          }
        }, lines));
      });
      panel.appendChild(body);
      panel.appendChild(h('button', {
        className: 'choice-btn choice-add', attrs: { type: 'button' }, text: '追加する',
        onClick: function () {
          if (!selected.length) return;
          selected.forEach(function (vid) { parkVehicleInGroup(vid, groupId); });
          persist(); renderAll();
          showToast(g.displayLabel + 'へ', selected.length + '台を追加しました');
          close();
        }
      }));
      var footer = h('div', { className: 'modal-footer two-col' });
      footer.appendChild(h('button', { className: 'cancel-btn', text: '戻る', attrs: { type: 'button' }, onClick: onBack }));
      footer.appendChild(h('button', { className: 'cancel-btn', text: 'キャンセル', attrs: { type: 'button' }, onClick: close }));
      panel.appendChild(footer);
    }
    render();
  }

  // 運転手のいないダンプ(駐車のみ)だけを対象にする。運転手が乗って
  // いるダンプを外したい場合は「組合せを変更」か、先に運転手を外す。
  function buildGroupRemoveVehicle(panel, groupId, close, onBack) {
    var selected = [];
    function render() {
      panel.innerHTML = '';
      var g = findGroup(groupId);
      var vehicles = state.vehicles.filter(function (v) { return v.active !== false && v.todayGroupId === groupId && !findAssignmentForVehicle(v.id); });
      panel.appendChild(modalHeader('ダンプを外す', g.displayLabel + 'から外す(運転手なしで駐車中の)ダンプをタップして選んでください(複数選択可)'));
      panel.appendChild(h('div', { className: 'current-line', text: '選択中：' + selected.length + '台' }));
      var body = h('div', { className: 'modal-body scroll-list' });
      if (!vehicles.length) body.appendChild(h('p', { className: 'record-empty', text: 'この配置枠に、運転手なしで駐車中のダンプはありません。' }));
      vehicles.forEach(function (v) {
        var isSel = selected.indexOf(v.id) !== -1;
        body.appendChild(h('button', {
          className: 'list-btn vehicle-item select-item' + (isSel ? ' is-selected' : ''),
          attrs: { type: 'button' },
          onClick: function () {
            var idx = selected.indexOf(v.id);
            if (idx !== -1) selected.splice(idx, 1); else selected.push(v.id);
            render();
          }
        }, [
          h('span', { className: 'select-mark', text: isSel ? '■' : '□' }),
          h('span', { className: 'list-btn-text', text: v.displayName })
        ]));
      });
      panel.appendChild(body);
      panel.appendChild(h('button', {
        className: 'choice-btn choice-absent', attrs: { type: 'button' }, text: '外す',
        onClick: function () {
          if (!selected.length) return;
          selected.forEach(function (vid) { releaseVehicleEverywhere(vid); });
          persist(); renderAll();
          showToast(g.displayLabel, selected.length + '台を外しました');
          close();
        }
      }));
      var footer = h('div', { className: 'modal-footer two-col' });
      footer.appendChild(h('button', { className: 'cancel-btn', text: '戻る', attrs: { type: 'button' }, onClick: onBack }));
      footer.appendChild(h('button', { className: 'cancel-btn', text: 'キャンセル', attrs: { type: 'button' }, onClick: close }));
      panel.appendChild(footer);
    }
    render();
  }

  function buildGroupRepairPicker(panel, groupId, close, onBack) {
    panel.innerHTML = '';
    var g = findGroup(groupId);
    var members = sortByOrder(groupMembers(groupId));
    panel.appendChild(modalHeader('組合せを変更', 'ダンプを変更する運転手をタップしてください'));
    var body = h('div', { className: 'modal-body scroll-list' });
    if (!members.length) body.appendChild(h('p', { className: 'record-empty', text: 'この配置枠に運転手はいません。' }));
    members.forEach(function (s) {
      var asn = findAssignmentForStaff(s.id);
      var vehicle = asn ? findVehicle(asn.vehicleId) : null;
      body.appendChild(h('button', {
        className: 'list-btn driver-item', attrs: { type: 'button' },
        onClick: function () { buildVehiclePickerForStaff(panel, s.id, close, function () { buildGroupRepairPicker(panel, groupId, close, onBack); }); }
      }, [
        h('span', { className: 'list-btn-text', text: s.name }),
        h('span', { className: 'list-btn-tag', text: vehicle ? vehicle.displayName : '未割当' })
      ]));
    });
    panel.appendChild(body);
    panel.appendChild(h('div', { className: 'modal-footer' }, [
      h('button', { className: 'cancel-btn', text: '戻る', attrs: { type: 'button' }, onClick: onBack })
    ]));
  }

  function buildGroupEndConfirm(panel, groupId, close, onBack) {
    panel.innerHTML = '';
    var g = findGroup(groupId);
    panel.appendChild(modalHeader('配置枠を終了しますか？', g.displayLabel + 'に配置されている全員・全車両の割当を解除します(現場自体は削除されず、この配置枠の番号もそのまま残ります)。'));
    var body = h('div', { className: 'modal-body big-choice-list' });
    body.appendChild(h('button', { className: 'choice-btn choice-absent', attrs: { type: 'button' }, text: '終了する', onClick: function () { endGroup(groupId); persist(); renderAll(); close(); } }));
    panel.appendChild(body);
    var footer = h('div', { className: 'modal-footer two-col' });
    footer.appendChild(h('button', { className: 'cancel-btn', text: '戻る', attrs: { type: 'button' }, onClick: onBack }));
    footer.appendChild(h('button', { className: 'cancel-btn', text: 'キャンセル', attrs: { type: 'button' }, onClick: close }));
    panel.appendChild(footer);
  }

  // 運輸見出しの「既存現場を編集」から: 現場(→複数配置枠があれば
  // どの枠か)を選んでから編集メニューを開く。
  function openExistingSiteEditPicker(department) {
    openModal(function (panel, close) {
      buildExistingSiteEditPicker(panel, department, close);
    });
  }

  function buildExistingSiteEditPicker(panel, department, close) {
    panel.innerHTML = '';
    panel.appendChild(modalHeader('編集する現場を選択', '現場をタップしてください'));
    var body = h('div', { className: 'modal-body scroll-list' });
    // 使用停止にした現場でも、既に動いている配置枠は編集できるようにする
    // (現場マスタの使用停止/使用可能は「新規作成」の候補一覧にのみ影響する)。
    var candidateSites = state.sites.filter(function (site) { return site.category === department || site.category === 'common'; });
    var sitesWithGroups = candidateSites.filter(function (site) { return groupsForSite(site.id, department, true).length > 0; });
    if (!sitesWithGroups.length) body.appendChild(h('p', { className: 'record-empty', text: '現在、配置されている現場はありません。' }));
    sitesWithGroups.forEach(function (site) {
      var groups = groupsForSite(site.id, department, true);
      body.appendChild(h('button', {
        className: 'list-btn site-item', attrs: { type: 'button' },
        onClick: function () {
          if (groups.length === 1) { close(); openGroupEditMenu(department, groups[0].id); return; }
          buildGroupPickerForEdit(panel, department, groups, close);
        }
      }, [
        h('span', { className: 'list-btn-text', text: site.name }),
        h('span', { className: 'list-btn-tag', text: groups.length + '枠' })
      ]));
    });
    panel.appendChild(body);
    panel.appendChild(cancelBar(close));
  }

  function buildGroupPickerForEdit(panel, department, groups, close) {
    panel.innerHTML = '';
    panel.appendChild(modalHeader('編集する配置枠を選択', 'タップしてください'));
    var body = h('div', { className: 'modal-body scroll-list' });
    groups.forEach(function (g) {
      body.appendChild(h('button', {
        className: 'list-btn site-item', attrs: { type: 'button' },
        onClick: function () { close(); openGroupEditMenu(department, g.id); }
      }, [
        h('span', { className: 'list-btn-text', text: g.displayLabel }),
        h('span', { className: 'list-btn-tag', text: groupCountsLabel(g.id, department) })
      ]));
    });
    panel.appendChild(body);
    panel.appendChild(cancelBar(close));
  }

  // ============================================================
  // 現場管理: 現場名(現場マスタ)は一度登録すれば消えることなく残り、
  // 「現場を選択」の一覧に毎回出てくる。ここでは、その現場名自体の
  // 修正と、不要になった現場を一覧から消す(使用停止/再度使用可能)
  // 操作をまとめて行う。使用停止にしても、既に動いている配置枠自体は
  // 終了するまで盤面に残る(現場マスタと当日の配置枠は別データ)。
  // ============================================================
  var SITE_ADMIN_FILTERS = [
    { key: 'all', label: '全て' },
    { key: 'doboku', label: '土木' },
    { key: 'unyu', label: '運輸' },
    { key: 'common', label: '共通' },
    { key: 'inactive', label: '使用停止中' }
  ];
  var SITE_CATEGORY_ORDER = ['doboku', 'unyu', 'common'];
  function siteCategoryLabel(category) { return category === 'common' ? '共通' : (DEPT_LABELS[category] || category); }

  function openSiteAdmin() {
    openModal(function (panel, close) {
      buildSiteAdminContent(panel, close, 'all');
    });
  }

  function buildSiteAdminContent(panel, close, filter) {
    filter = filter || 'all';
    panel.innerHTML = '';
    var backHere = function () { buildSiteAdminContent(panel, close, filter); };
    panel.appendChild(modalHeader('現場管理', '一度登録した現場名は消えずに残ります。区分をタップして絞り込み、現場をタップして編集してください'));
    panel.appendChild(filterChipRow(SITE_ADMIN_FILTERS, filter, function (key) { buildSiteAdminContent(panel, close, key); }));

    var body = h('div', { className: 'modal-body scroll-list' });

    if (filter === 'inactive') {
      var inactiveSites = sortByOrder(state.sites.filter(function (s) { return s.status !== 'active'; }));
      if (!inactiveSites.length) body.appendChild(h('p', { className: 'record-empty', text: '使用停止中の現場はありません。' }));
      inactiveSites.forEach(function (site) {
        body.appendChild(h('button', {
          className: 'list-btn site-item', attrs: { type: 'button' },
          onClick: function () { buildSiteReactivateConfirm(panel, site.id, close, backHere); }
        }, [
          h('span', { className: 'list-btn-text', text: site.name }),
          h('span', { className: 'list-btn-tag', text: siteCategoryLabel(site.category) })
        ]));
      });
    } else {
      var cats = filter === 'all' ? SITE_CATEGORY_ORDER : [filter];
      var any = false;
      cats.forEach(function (cat) {
        var list = sortByOrder(state.sites.filter(function (s) { return s.category === cat && s.status === 'active'; }));
        if (!list.length) return;
        any = true;
        if (filter === 'all') body.appendChild(h('div', { className: 'records-section-title', text: siteCategoryLabel(cat) + 'の現場' }));
        list.forEach(function (site) {
          body.appendChild(h('button', {
            className: 'list-btn site-item', attrs: { type: 'button' },
            onClick: function () { buildSiteEditMenu(panel, site.id, close, backHere); }
          }, [
            h('span', { className: 'list-btn-text', text: site.name })
          ]));
        });
      });
      if (!any) body.appendChild(h('p', { className: 'record-empty', text: '該当する現場がありません。' }));
    }

    panel.appendChild(body);
    panel.appendChild(h('button', {
      className: 'choice-btn choice-add', attrs: { type: 'button' }, text: '＋ 新しい現場を追加',
      onClick: function () {
        buildNewSiteFormCore(panel, function () { buildSiteAdminContent(panel, close, 'all'); }, backHere);
      }
    }));
    panel.appendChild(cancelBar(close));
  }

  function buildSiteEditMenu(panel, siteId, close, onBack) {
    panel.innerHTML = '';
    var site = findSite(siteId);
    var backHere = function () { buildSiteEditMenu(panel, siteId, close, onBack); };
    panel.appendChild(modalHeader(site.name + 'の編集', '変更する項目を選んでください'));
    panel.appendChild(h('div', { className: 'current-line', text: '区分：' + siteCategoryLabel(site.category) }));

    var body = h('div', { className: 'modal-body big-choice-list' });
    body.appendChild(h('button', {
      className: 'choice-btn choice-move', attrs: { type: 'button' }, text: '現場名を修正',
      onClick: function () { buildSiteRenameForm(panel, siteId, close, backHere); }
    }));
    body.appendChild(h('button', {
      className: 'choice-btn choice-absent', attrs: { type: 'button' }, text: '使用停止にする(一覧から消す)',
      onClick: function () { buildSiteDeactivateConfirm(panel, siteId, close, backHere); }
    }));
    panel.appendChild(body);
    var footer = h('div', { className: 'modal-footer two-col' });
    footer.appendChild(h('button', { className: 'cancel-btn', text: '戻る', attrs: { type: 'button' }, onClick: onBack }));
    footer.appendChild(h('button', { className: 'cancel-btn', text: 'キャンセル', attrs: { type: 'button' }, onClick: close }));
    panel.appendChild(footer);
  }

  function buildSiteRenameForm(panel, siteId, close, onBack) {
    panel.innerHTML = '';
    var site = findSite(siteId);
    panel.appendChild(modalHeader('現場名を修正', '新しい現場名を入力してください(既に配置枠が動いている現場では、動いている配置枠の表示名は変わりません)'));
    var body = h('div', { className: 'modal-body' });
    var errorMsg = h('p', { className: 'form-error hidden' });
    var input = h('input', { className: 'form-input', attrs: { type: 'text', inputmode: 'text', autocomplete: 'off' } });
    input.value = site.name;
    body.appendChild(h('label', { className: 'form-label', text: '現場名' }));
    body.appendChild(input);
    body.appendChild(errorMsg);
    panel.appendChild(body);
    var footer = h('div', { className: 'modal-footer two-col' });
    footer.appendChild(h('button', { className: 'cancel-btn', text: '戻る', attrs: { type: 'button' }, onClick: onBack }));
    footer.appendChild(h('button', {
      className: 'save-btn', text: '保存', attrs: { type: 'button' },
      onClick: function () {
        var trimmed = input.value.trim();
        if (!trimmed) { errorMsg.textContent = '現場名を入力してください。'; errorMsg.classList.remove('hidden'); return; }
        var dup = state.sites.some(function (s) { return s.id !== siteId && s.name === trimmed; });
        if (dup) { errorMsg.textContent = '同じ名前の現場が既に登録されています。'; errorMsg.classList.remove('hidden'); return; }
        site.name = trimmed;
        persist(); renderAll();
        onBack();
      }
    }));
    panel.appendChild(footer);
    input.focus();
  }

  function buildSiteDeactivateConfirm(panel, siteId, close, onBack) {
    panel.innerHTML = '';
    var site = findSite(siteId);
    var activeGroupCount = state.dispatchGroups.filter(function (g) { return g.siteId === siteId && g.active !== false; }).length;
    var subtitle = '「現場を選択」の一覧に出てこなくなります(いつでも「使用停止中」から戻せます)。';
    if (activeGroupCount) subtitle += '\n※ 現在この現場を使った配置枠が' + activeGroupCount + '件動いていますが、そちらは終了するまでそのまま盤面に残ります。';
    panel.appendChild(modalHeader(site.name + 'を使用停止にしますか？', subtitle));
    var body = h('div', { className: 'modal-body big-choice-list' });
    body.appendChild(h('button', {
      className: 'choice-btn choice-absent', attrs: { type: 'button' }, text: '使用停止にする',
      onClick: function () { site.status = 'inactive'; persist(); renderAll(); showToast(site.name, '使用停止にしました'); close(); }
    }));
    panel.appendChild(body);
    panel.appendChild(cancelBar(onBack));
  }

  function buildSiteReactivateConfirm(panel, siteId, close, onBack) {
    panel.innerHTML = '';
    var site = findSite(siteId);
    panel.appendChild(modalHeader(site.name + 'を再度使用可能にしますか？', '「現場を選択」の一覧に再び表示されます。'));
    var body = h('div', { className: 'modal-body big-choice-list' });
    body.appendChild(h('button', {
      className: 'choice-btn choice-add', attrs: { type: 'button' }, text: '使用可能にする',
      onClick: function () { site.status = 'active'; persist(); renderAll(); showToast(site.name, '使用可能に戻しました'); close(); }
    }));
    panel.appendChild(body);
    panel.appendChild(cancelBar(onBack));
  }

  // ============================================================
  // 配置登録ウィザード: 現場 → 既存枠/新規枠 → (運輸のみ)ダンプ複数選択
  // → 作業員/運転手複数選択 → 確認 → 一括登録。
  // 運輸の場合、通常ダンプの組合せを優先して自動でペアにし、例外だけ
  // 確認画面でダンプを選び直せる。
  // ============================================================
  var WIZARD_STEP_LABELS_UNYU = ['現場', '配置枠', '運転手', '確認'];
  var WIZARD_STEP_LABELS_DOBOKU = ['現場', '配置枠', '作業員', '確認'];

  function wizardProgress(department, currentStep) {
    var labels = department === 'unyu' ? WIZARD_STEP_LABELS_UNYU : WIZARD_STEP_LABELS_DOBOKU;
    return h('div', { className: 'wizard-progress' }, labels.map(function (label, idx) {
      var stepNum = idx + 1;
      var cls = 'wizard-step' + (stepNum === currentStep ? ' is-current' : (stepNum < currentStep ? ' is-done' : ''));
      return h('div', { className: cls }, [
        h('span', { className: 'wizard-step-num', text: String(stepNum) }),
        h('span', { className: 'wizard-step-label', text: label })
      ]);
    }));
  }

  function newGroupWizardState(department) {
    return { department: department, siteId: null, groupId: null, vehicleIds: [], staffIds: [], pairs: [], extraStaffIds: [], autoVehicleFor: {} };
  }

  function openGroupWizard(department) {
    openModal(function (panel, close) {
      buildWizardStepSite(panel, close, newGroupWizardState(department));
    });
  }

  // ---- ステップ1・2: 現場 → 既存枠/新規枠 ----
  function buildWizardStepSite(panel, close, ws) {
    buildSitePickerForGroup(panel, ws.department, close, function (groupId, site) {
      ws.siteId = site ? site.id : null;
      ws.groupId = groupId;
      if (!groupId) { buildWizardUndecidedStaffMulti(panel, close, ws); return; }
      if (ws.department === 'unyu') buildWizardDriverMultiUnyu(panel, close, ws);
      else buildWizardStaffMulti(panel, close, ws);
    }, close);
  }

  // ---- 「現場未定」の簡易ルート: ダンプの組合せは行わず、人だけ選ぶ ----
  function buildWizardUndecidedStaffMulti(panel, close, ws) {
    panel.innerHTML = '';
    panel.appendChild(modalHeader((ws.department === 'unyu' ? '運転手' : '作業員') + 'を選択', 'タップして選んでください(複数選択可)。現場未定のまま登録します。'));
    panel.appendChild(h('div', { className: 'current-line', text: '選択中：' + ws.staffIds.length + '人' }));
    var body = h('div', { className: 'modal-body scroll-list' });
    var pool = ws.department === 'unyu' ? dumpDriverCandidates() : state.staff.filter(function (s) { return s.department === 'doboku' && s.active !== false; });
    sortByOrder(pool).forEach(function (s) {
      var selected = ws.staffIds.indexOf(s.id) !== -1;
      var sGroup = s.todayGroupId ? findGroup(s.todayGroupId) : null;
      body.appendChild(h('button', {
        className: 'list-btn driver-item select-item' + (selected ? ' is-selected' : '') + (s.attendance === 'present' ? ' is-present-driver' : ' is-absent-driver'),
        attrs: { type: 'button' },
        onClick: function () {
          var idx = ws.staffIds.indexOf(s.id);
          if (idx !== -1) { ws.staffIds.splice(idx, 1); buildWizardUndecidedStaffMulti(panel, close, ws); return; }
          ws.staffIds.push(s.id);
          buildWizardUndecidedStaffMulti(panel, close, ws);
        }
      }, [
        h('span', { className: 'select-mark', text: selected ? '■' : '□' }),
        h('span', { className: 'list-btn-text', text: s.name }),
        h('span', { className: 'status-badge ' + (s.attendance === 'present' ? 'status-available' : 'status-suspended'), text: s.attendance === 'present' ? '出勤' : '退勤' }),
        (sGroup && !selected) ? h('span', { className: 'list-btn-tag', text: sGroup.displayLabel }) : null
      ]));
    });
    panel.appendChild(body);
    var actionRow = h('div', { className: 'modal-footer two-col' });
    actionRow.appendChild(h('button', { className: 'cancel-btn', text: '全選択解除', attrs: { type: 'button' }, onClick: function () { ws.staffIds = []; buildWizardUndecidedStaffMulti(panel, close, ws); } }));
    actionRow.appendChild(h('button', {
      className: 'save-btn', text: '登録', attrs: { type: 'button' },
      onClick: function () {
        if (!ws.staffIds.length) return;
        var now = new Date();
        var absentOnes = ws.staffIds.map(findStaff).filter(function (s) { return s.attendance === 'absent'; });
        function commit(markPresent) {
          ws.staffIds.forEach(function (id) {
            var s = findStaff(id);
            removeStaffFromGroup(s);
            if (markPresent && s.attendance !== 'present') applyAttendanceChange(s, 'present', now);
          });
          persist(); renderAll();
          showToast('現場未定へ', ws.staffIds.length + '人を登録しました');
          close();
        }
        if (!absentOnes.length) { commit(false); return; }
        panel.innerHTML = '';
        var names = absentOnes.map(function (s) { return s.name; }).join('、');
        panel.appendChild(modalHeader('出退勤の確認', names + 'さんは現在「退勤」状態です。'));
        var body2 = h('div', { className: 'modal-body big-choice-list' });
        body2.appendChild(h('button', { className: 'choice-btn choice-add', attrs: { type: 'button' }, text: '出勤を記録して登録', onClick: function () { commit(true); } }));
        body2.appendChild(h('button', { className: 'choice-btn choice-neutral', attrs: { type: 'button' }, text: '登録だけ行う', onClick: function () { commit(false); } }));
        panel.appendChild(body2);
        panel.appendChild(cancelBar(close));
      }
    }));
    panel.appendChild(actionRow);
    panel.appendChild(cancelBar(close));
  }

  // ---- ステップ3(運輸): 運転手を選択。運転手とダンプは基本セットなので、
  // 通常ダンプ(normalVehicleId)が空いていれば自動で一緒に選択する。
  // 通常と違う車に乗せたい時・運転手なしでダンプだけ駐車したい時は、
  // 次の確認画面でその都度タップして調整する。
  function buildWizardDriverMultiUnyu(panel, close, ws) {
    panel.innerHTML = '';
    var g = findGroup(ws.groupId);
    panel.appendChild(wizardProgress('unyu', 3));
    panel.appendChild(modalHeader('運転手を選択', g.displayLabel + 'へ配置する運転手をタップして選んでください(複数選択可)。通常のダンプが空いていれば自動でセットになります。'));
    panel.appendChild(h('div', { className: 'current-line', text: '選択中：' + ws.staffIds.length + '人 ／ ダンプ：' + ws.vehicleIds.length + '台' }));

    var body = h('div', { className: 'modal-body scroll-list' });
    var candidates = sortByOrder(dumpDriverCandidates());
    candidates.forEach(function (s) {
      var selected = ws.staffIds.indexOf(s.id) !== -1;
      var sGroup = s.todayGroupId ? findGroup(s.todayGroupId) : null;
      var normalVehicle = s.normalVehicleId ? findVehicle(s.normalVehicleId) : null;
      body.appendChild(h('button', {
        className: 'list-btn driver-item select-item' + (selected ? ' is-selected' : '') + (s.attendance === 'present' ? ' is-present-driver' : ' is-absent-driver'),
        attrs: { type: 'button' },
        onClick: function () { toggleWizardDriver(panel, close, ws, s); }
      }, [
        h('span', { className: 'select-mark', text: selected ? '■' : '□' }),
        h('span', { className: 'list-btn-text', text: s.name }),
        h('span', { className: 'status-badge ' + (s.attendance === 'present' ? 'status-available' : 'status-suspended'), text: s.attendance === 'present' ? '出勤' : '退勤' }),
        h('span', { className: 'list-btn-tag', text: normalVehicle ? '通常：' + normalVehicle.displayName : '通常ダンプ設定なし' }),
        (s.department !== 'unyu' && !selected) ? h('span', { className: 'list-btn-tag', text: DEPT_LABELS[s.department] }) : null,
        (sGroup && !selected) ? h('span', { className: 'list-btn-tag', text: sGroup.displayLabel }) : null
      ]));
    });
    panel.appendChild(body);

    var actionRow = h('div', { className: 'modal-footer two-col' });
    actionRow.appendChild(h('button', {
      className: 'cancel-btn', text: '全選択解除', attrs: { type: 'button' },
      onClick: function () { ws.staffIds = []; ws.vehicleIds = []; ws.autoVehicleFor = {}; buildWizardDriverMultiUnyu(panel, close, ws); }
    }));
    actionRow.appendChild(h('button', {
      className: 'save-btn', text: '次へ', attrs: { type: 'button' },
      onClick: function () {
        if (!ws.staffIds.length) return;
        computeAutoWizardPairs(ws);
        buildWizardPairingConfirm(panel, close, ws);
      }
    }));
    panel.appendChild(actionRow);

    var footer = h('div', { className: 'modal-footer two-col' });
    footer.appendChild(h('button', { className: 'cancel-btn', text: '戻る', attrs: { type: 'button' }, onClick: function () { buildWizardStepSite(panel, close, ws); } }));
    footer.appendChild(h('button', { className: 'cancel-btn', text: 'キャンセル', attrs: { type: 'button' }, onClick: close }));
    panel.appendChild(footer);
  }

  // 運転手を選択に追加する。通常ダンプが空いていれば自動で一緒に確保し、
  // どの運転手のおかげで選ばれたダンプかをautoVehicleForに覚えておく
  // (その運転手の選択を解除した時に、ダンプも一緒に外すため)。
  function addWizardDriver(ws, s) {
    ws.staffIds.push(s.id);
    if (!s.normalVehicleId || ws.vehicleIds.indexOf(s.normalVehicleId) !== -1) return;
    var v = findVehicle(s.normalVehicleId);
    if (!v || v.active === false || v.status !== 'available') return;
    var asn = findAssignmentForVehicle(v.id);
    var currentGroupId = asn ? asn.groupId : v.todayGroupId;
    if (currentGroupId && currentGroupId !== ws.groupId) return;
    ws.vehicleIds.push(v.id);
    ws.autoVehicleFor[s.id] = v.id;
  }

  function toggleWizardDriver(panel, close, ws, s) {
    var idx = ws.staffIds.indexOf(s.id);
    if (idx !== -1) {
      ws.staffIds.splice(idx, 1);
      var autoVid = ws.autoVehicleFor[s.id];
      if (autoVid) {
        var vIdx = ws.vehicleIds.indexOf(autoVid);
        if (vIdx !== -1) ws.vehicleIds.splice(vIdx, 1);
        delete ws.autoVehicleFor[s.id];
      }
      buildWizardDriverMultiUnyu(panel, close, ws);
      return;
    }
    if (isDriverAlreadyInOtherGroup(s, ws.groupId)) {
      var curGroup = s.todayGroupId ? findGroup(s.todayGroupId) : null;
      var targetGroup = findGroup(ws.groupId);
      var crossDept = curGroup && curGroup.department !== ws.department;
      var message = crossDept
        ? s.name + 'さんは現在、' + DEPT_LABELS[curGroup.department] + 'の' + curGroup.displayLabel + 'に配置されています。\n' +
          DEPT_LABELS[ws.department] + 'の' + targetGroup.displayLabel + 'へ移動しますか？'
        : s.name + 'さんは現在「' + (curGroup ? curGroup.displayLabel : '現場未定') + '」に登録されています。\n「' + targetGroup.displayLabel + '」へ移動しますか？';
      panel.innerHTML = '';
      panel.appendChild(modalHeader('確認', message));
      var body = h('div', { className: 'modal-body big-choice-list' });
      body.appendChild(h('button', {
        className: 'choice-btn choice-add', attrs: { type: 'button' }, text: '移動する',
        onClick: function () { addWizardDriver(ws, s); buildWizardDriverMultiUnyu(panel, close, ws); }
      }));
      panel.appendChild(body);
      panel.appendChild(h('div', { className: 'modal-footer' }, [
        h('button', { className: 'cancel-btn', text: '戻る', attrs: { type: 'button' }, onClick: function () { buildWizardDriverMultiUnyu(panel, close, ws); } })
      ]));
      return;
    }
    addWizardDriver(ws, s);
    buildWizardDriverMultiUnyu(panel, close, ws);
  }

  // ---- ステップ3(土木): 作業員の複数選択 ----
  function buildWizardStaffMulti(panel, close, ws) {
    panel.innerHTML = '';
    var g = findGroup(ws.groupId);
    panel.appendChild(wizardProgress('doboku', 3));
    panel.appendChild(modalHeader('作業員を選択', 'タップして選んでください(複数選択可)'));
    panel.appendChild(h('div', { className: 'current-line', text: '選択中：' + ws.staffIds.length + '人' }));

    var body = h('div', { className: 'modal-body scroll-list' });
    var pool = state.staff.filter(function (s) { return s.department === 'doboku' && s.active !== false; });
    sortByOrder(pool).forEach(function (s) {
      var selected = ws.staffIds.indexOf(s.id) !== -1;
      var sGroup = s.todayGroupId ? findGroup(s.todayGroupId) : null;
      body.appendChild(h('button', {
        className: 'list-btn driver-item select-item' + (selected ? ' is-selected' : '') + (s.attendance === 'present' ? ' is-present-driver' : ' is-absent-driver'),
        attrs: { type: 'button' },
        onClick: function () { toggleWizardStaff(panel, close, ws, s); }
      }, [
        h('span', { className: 'select-mark', text: selected ? '■' : '□' }),
        h('span', { className: 'list-btn-text', text: s.name }),
        h('span', { className: 'status-badge ' + (s.attendance === 'present' ? 'status-available' : 'status-suspended'), text: s.attendance === 'present' ? '出勤' : '退勤' }),
        (sGroup && !selected) ? h('span', { className: 'list-btn-tag', text: sGroup.displayLabel }) : null
      ]));
    });
    panel.appendChild(body);

    var actionRow = h('div', { className: 'modal-footer two-col' });
    actionRow.appendChild(h('button', { className: 'cancel-btn', text: '全選択解除', attrs: { type: 'button' }, onClick: function () { ws.staffIds = []; buildWizardStaffMulti(panel, close, ws); } }));
    actionRow.appendChild(h('button', {
      className: 'save-btn', text: '次へ', attrs: { type: 'button' },
      onClick: function () { if (ws.staffIds.length) buildWizardConfirmDoboku(panel, close, ws); }
    }));
    panel.appendChild(actionRow);

    var footer = h('div', { className: 'modal-footer two-col' });
    footer.appendChild(h('button', { className: 'cancel-btn', text: '戻る', attrs: { type: 'button' }, onClick: function () { buildWizardStepSite(panel, close, ws); } }));
    footer.appendChild(h('button', { className: 'cancel-btn', text: 'キャンセル', attrs: { type: 'button' }, onClick: close }));
    panel.appendChild(footer);
  }

  function toggleWizardStaff(panel, close, ws, s) {
    var idx = ws.staffIds.indexOf(s.id);
    if (idx !== -1) { ws.staffIds.splice(idx, 1); buildWizardStaffMulti(panel, close, ws); return; }
    if (isDriverAlreadyInOtherGroup(s, ws.groupId)) {
      var curGroup = s.todayGroupId ? findGroup(s.todayGroupId) : null;
      var targetGroup = findGroup(ws.groupId);
      var crossDept = curGroup && curGroup.department !== ws.department;
      var message = crossDept
        ? s.name + 'さんは現在、' + DEPT_LABELS[curGroup.department] + 'の' + curGroup.displayLabel + 'に配置されています。\n' +
          DEPT_LABELS[ws.department] + 'の' + targetGroup.displayLabel + 'へ移動しますか？'
        : s.name + 'さんは現在「' + (curGroup ? curGroup.displayLabel : '現場未定') + '」に登録されています。\n「' + targetGroup.displayLabel + '」へ移動しますか？';
      panel.innerHTML = '';
      panel.appendChild(modalHeader('確認', message));
      var body = h('div', { className: 'modal-body big-choice-list' });
      body.appendChild(h('button', {
        className: 'choice-btn choice-add', attrs: { type: 'button' }, text: '移動する',
        onClick: function () { ws.staffIds.push(s.id); buildWizardStaffMulti(panel, close, ws); }
      }));
      panel.appendChild(body);
      panel.appendChild(h('div', { className: 'modal-footer' }, [
        h('button', { className: 'cancel-btn', text: '戻る', attrs: { type: 'button' }, onClick: function () { buildWizardStaffMulti(panel, close, ws); } })
      ]));
      return;
    }
    ws.staffIds.push(s.id);
    buildWizardStaffMulti(panel, close, ws);
  }

  // 選択されたダンプ・運転手から仮の対応関係を作る。通常ダンプの組合せを
  // 優先し、残りは選択順にペアリングする。あぶれた分は「未割当」として残す。
  function computeAutoWizardPairs(ws) {
    var pairs = [];
    var usedVehicle = {}, usedStaff = {};
    ws.staffIds.forEach(function (id) {
      var s = findStaff(id);
      if (s.normalVehicleId && ws.vehicleIds.indexOf(s.normalVehicleId) !== -1 && !usedVehicle[s.normalVehicleId]) {
        pairs.push({ staffId: id, vehicleId: s.normalVehicleId });
        usedVehicle[s.normalVehicleId] = true;
        usedStaff[id] = true;
      }
    });
    var remStaff = ws.staffIds.filter(function (id) { return !usedStaff[id]; });
    var remVehicles = ws.vehicleIds.filter(function (id) { return !usedVehicle[id]; });
    var n = Math.min(remStaff.length, remVehicles.length);
    for (var i = 0; i < n; i++) pairs.push({ staffId: remStaff[i], vehicleId: remVehicles[i] });
    ws.pairs = pairs;
    ws.extraStaffIds = remStaff.slice(n);
    ws.extraVehicleIds = remVehicles.slice(n);
  }

  // ---- 確認画面(運輸): 対応関係の確認・一括登録 ----
  function buildWizardPairingConfirm(panel, close, ws) {
    panel.innerHTML = '';
    var g = findGroup(ws.groupId);
    panel.appendChild(wizardProgress('unyu', 4));
    panel.appendChild(modalHeader('配車内容を確認してください', g.displayLabel + 'へ追加する内容です。通常と違うダンプにする時だけ、行をタップして変更してください。'));

    var body = h('div', { className: 'modal-body scroll-list' });
    ws.pairs.forEach(function (p) {
      var driver = findStaff(p.staffId);
      var vehicle = findVehicle(p.vehicleId);
      body.appendChild(h('button', {
        className: 'list-btn pairing-item', attrs: { type: 'button' },
        onClick: function () { buildWizardVehiclePickerForPair(panel, close, ws, p.staffId); }
      }, [
        h('span', { className: 'list-btn-text', text: driver.name }),
        h('span', { className: 'list-btn-tag', text: '→ ' + vehicle.displayName })
      ]));
    });
    ws.extraStaffIds.forEach(function (id) {
      var driver = findStaff(id);
      body.appendChild(h('button', {
        className: 'list-btn pairing-item is-unpaired', attrs: { type: 'button' },
        onClick: function () { buildWizardVehiclePickerForPair(panel, close, ws, id); }
      }, [
        h('span', { className: 'list-btn-text', text: driver.name }),
        h('span', { className: 'list-btn-tag', text: 'ダンプ未定(タップして選択)' })
      ]));
    });
    (ws.extraVehicleIds || []).forEach(function (vid) {
      var vehicle = findVehicle(vid);
      body.appendChild(h('div', { className: 'list-btn pairing-item is-unpaired' }, [
        h('span', { className: 'list-btn-text', text: vehicle.displayName }),
        h('span', { className: 'list-btn-tag', text: '未割当(運転手なし・駐車のみ)' })
      ]));
    });
    panel.appendChild(body);

    panel.appendChild(h('button', {
      className: 'choice-btn choice-neutral', attrs: { type: 'button' }, text: '＋ 運転手なしのダンプを追加(駐車のみ)',
      onClick: function () { buildWizardParkedVehiclePicker(panel, close, ws); }
    }));
    panel.appendChild(h('button', {
      className: 'choice-btn choice-add', attrs: { type: 'button' }, text: 'この内容で一括登録',
      onClick: function () { proceedToWizardAttendanceGate(panel, close, ws); }
    }));

    var footer = h('div', { className: 'modal-footer two-col' });
    footer.appendChild(h('button', { className: 'cancel-btn', text: '戻る', attrs: { type: 'button' }, onClick: function () { buildWizardDriverMultiUnyu(panel, close, ws); } }));
    footer.appendChild(h('button', { className: 'cancel-btn', text: 'キャンセル', attrs: { type: 'button' }, onClick: close }));
    panel.appendChild(footer);
  }

  // 対応確認画面から、その人のダンプを選び直す。通常は運転手とダンプが
  // セットなので自動選択のままでよく、これは例外(通常と違う車に乗せる)
  // 時だけ使う。登録済みの全車両から、使用中/駐車中のものは確認の上で選べる。
  function buildWizardVehiclePickerForPair(panel, close, ws, staffId) {
    panel.innerHTML = '';
    var driver = findStaff(staffId);
    panel.appendChild(modalHeader(driver.name + 'さんのダンプを選択', '登録済みの車両からタップで選んでください'));

    var body = h('div', { className: 'modal-body scroll-list' });
    var currentPair = ws.pairs.filter(function (p) { return p.staffId === staffId; })[0];
    var currentVid = currentPair ? currentPair.vehicleId : null;
    var vehicles = sortByOrder(state.vehicles.filter(function (v) { return v.active !== false; }));
    vehicles.forEach(function (v) {
      var usable = v.status === 'available';
      var selected = currentVid === v.id;
      var owner = ws.pairs.filter(function (p) { return p.staffId !== staffId && p.vehicleId === v.id; })[0];
      var asn = usable && !owner ? findAssignmentForVehicle(v.id) : null;
      var parkedElsewhere = usable && !owner && !asn && v.todayGroupId && v.todayGroupId !== ws.groupId ? findGroup(v.todayGroupId) : null;
      var lines = [h('span', { className: 'list-btn-text', text: v.displayName })];
      if (!usable) lines.push(h('span', { className: 'status-badge status-' + v.status, text: VEHICLE_STATUS_LABELS[v.status] }));
      if (owner) lines.push(h('span', { className: 'list-btn-tag', text: findStaff(owner.staffId).name + 'さんと交換' }));
      if (asn) lines.push(h('span', { className: 'list-btn-tag', text: findStaff(asn.staffId).name + 'さん使用中(' + findGroup(asn.groupId).displayLabel + ')' }));
      if (parkedElsewhere) lines.push(h('span', { className: 'list-btn-tag', text: parkedElsewhere.displayLabel + 'に駐車中' }));
      if (selected) lines.push(h('span', { className: 'current-badge', text: '選択中' }));
      body.appendChild(h('button', {
        className: 'list-btn vehicle-item' + (selected ? ' is-selected' : '') + (usable ? '' : ' is-disabled'),
        attrs: { type: 'button' }, disabled: !usable,
        onClick: function () {
          if (!usable) return;
          if (asn || parkedElsewhere) {
            var who = asn ? findStaff(asn.staffId).name + 'さんが使用しています' : '駐車中です';
            var curLabel = asn ? findGroup(asn.groupId).displayLabel : parkedElsewhere.displayLabel;
            panel.innerHTML = '';
            panel.appendChild(modalHeader('確認', v.displayName + 'は現在「' + curLabel + '」で' + who + '。\n' + driver.name + 'さんのダンプに変更しますか？'));
            var cbody = h('div', { className: 'modal-body big-choice-list' });
            cbody.appendChild(h('button', {
              className: 'choice-btn choice-add', attrs: { type: 'button' }, text: '変更する',
              onClick: function () { reassignWizardPair(ws, staffId, v.id); buildWizardPairingConfirm(panel, close, ws); }
            }));
            panel.appendChild(cbody);
            panel.appendChild(h('div', { className: 'modal-footer' }, [
              h('button', { className: 'cancel-btn', text: '戻る', attrs: { type: 'button' }, onClick: function () { buildWizardVehiclePickerForPair(panel, close, ws, staffId); } })
            ]));
            return;
          }
          reassignWizardPair(ws, staffId, v.id);
          buildWizardPairingConfirm(panel, close, ws);
        }
      }, lines));
    });
    panel.appendChild(body);
    panel.appendChild(h('div', { className: 'modal-footer' }, [
      h('button', { className: 'cancel-btn', text: '戻る', attrs: { type: 'button' }, onClick: function () { buildWizardPairingConfirm(panel, close, ws); } })
    ]));
  }

  // 運転手を付けず、駐車のみのダンプを追加する(通常は不要。例外的に
  // 空いている車を現場に置いておきたい時だけ使う)。
  function buildWizardParkedVehiclePicker(panel, close, ws) {
    panel.innerHTML = '';
    panel.appendChild(modalHeader('駐車のみのダンプを追加', '運転手を付けずに駐車させる車両をタップしてください'));

    var body = h('div', { className: 'modal-body scroll-list' });
    var claimedIds = {};
    ws.pairs.forEach(function (p) { claimedIds[p.vehicleId] = true; });
    (ws.extraVehicleIds || []).forEach(function (vid) { claimedIds[vid] = true; });
    var vehicles = sortByOrder(state.vehicles.filter(function (v) { return v.active !== false && !claimedIds[v.id]; }));
    vehicles.forEach(function (v) {
      var usable = v.status === 'available';
      var asn = usable ? findAssignmentForVehicle(v.id) : null;
      var parkedElsewhere = usable && !asn && v.todayGroupId && v.todayGroupId !== ws.groupId ? findGroup(v.todayGroupId) : null;
      var lines = [h('span', { className: 'list-btn-text', text: v.displayName })];
      if (!usable) lines.push(h('span', { className: 'status-badge status-' + v.status, text: VEHICLE_STATUS_LABELS[v.status] }));
      if (asn) lines.push(h('span', { className: 'list-btn-tag', text: findStaff(asn.staffId).name + 'さん使用中(' + findGroup(asn.groupId).displayLabel + ')' }));
      if (parkedElsewhere) lines.push(h('span', { className: 'list-btn-tag', text: parkedElsewhere.displayLabel + 'に駐車中' }));
      body.appendChild(h('button', {
        className: 'list-btn vehicle-item' + (usable ? '' : ' is-disabled'), attrs: { type: 'button' }, disabled: !usable,
        onClick: function () {
          if (!usable) return;
          if (asn || parkedElsewhere) {
            var who = asn ? findStaff(asn.staffId).name + 'さんが使用しています' : '駐車中です';
            var curLabel = asn ? findGroup(asn.groupId).displayLabel : parkedElsewhere.displayLabel;
            panel.innerHTML = '';
            panel.appendChild(modalHeader('確認', v.displayName + 'は現在「' + curLabel + '」で' + who + '。\n運転手なしで駐車のみ追加しますか？'));
            var cbody = h('div', { className: 'modal-body big-choice-list' });
            cbody.appendChild(h('button', {
              className: 'choice-btn choice-add', attrs: { type: 'button' }, text: '追加する',
              onClick: function () { (ws.extraVehicleIds = ws.extraVehicleIds || []).push(v.id); buildWizardPairingConfirm(panel, close, ws); }
            }));
            panel.appendChild(cbody);
            panel.appendChild(h('div', { className: 'modal-footer' }, [
              h('button', { className: 'cancel-btn', text: '戻る', attrs: { type: 'button' }, onClick: function () { buildWizardParkedVehiclePicker(panel, close, ws); } })
            ]));
            return;
          }
          (ws.extraVehicleIds = ws.extraVehicleIds || []).push(v.id);
          buildWizardPairingConfirm(panel, close, ws);
        }
      }, lines));
    });
    panel.appendChild(body);
    panel.appendChild(h('div', { className: 'modal-footer' }, [
      h('button', { className: 'cancel-btn', text: '戻る', attrs: { type: 'button' }, onClick: function () { buildWizardPairingConfirm(panel, close, ws); } })
    ]));
  }

  function reassignWizardPair(ws, staffId, newVehicleId) {
    var pairs = ws.pairs;
    var existing = pairs.filter(function (p) { return p.staffId === staffId; })[0];
    var oldVehicleId = existing ? existing.vehicleId : null;
    if (oldVehicleId === newVehicleId) return;
    var otherIdx = -1;
    pairs.forEach(function (p, i) { if (p.staffId !== staffId && p.vehicleId === newVehicleId) otherIdx = i; });

    if (existing) { existing.vehicleId = newVehicleId; }
    else {
      pairs.push({ staffId: staffId, vehicleId: newVehicleId });
      var exIdx = ws.extraStaffIds.indexOf(staffId);
      if (exIdx !== -1) ws.extraStaffIds.splice(exIdx, 1);
    }

    if (otherIdx !== -1) {
      if (oldVehicleId) { pairs[otherIdx].vehicleId = oldVehicleId; }
      else {
        var otherStaffId = pairs[otherIdx].staffId;
        pairs.splice(otherIdx, 1);
        ws.extraStaffIds.push(otherStaffId);
      }
    } else {
      var exVidIdx = (ws.extraVehicleIds || []).indexOf(newVehicleId);
      if (exVidIdx !== -1) ws.extraVehicleIds.splice(exVidIdx, 1);
      if (oldVehicleId) { (ws.extraVehicleIds = ws.extraVehicleIds || []).push(oldVehicleId); }
    }
  }

  // ---- 確認画面(土木): ダンプの組合せが無いので、そのまま一覧表示 ----
  function buildWizardConfirmDoboku(panel, close, ws) {
    panel.innerHTML = '';
    var g = findGroup(ws.groupId);
    panel.appendChild(wizardProgress('doboku', 4));
    panel.appendChild(modalHeader('配置内容を確認してください', g.displayLabel + 'へ配置します'));
    var body = h('div', { className: 'modal-body scroll-list' });
    ws.staffIds.forEach(function (id) {
      var s = findStaff(id);
      body.appendChild(h('div', { className: 'list-btn pairing-item' }, [h('span', { className: 'list-btn-text', text: s.name })]));
    });
    panel.appendChild(body);
    panel.appendChild(h('button', {
      className: 'choice-btn choice-add', attrs: { type: 'button' }, text: 'この内容で一括登録',
      onClick: function () { proceedToWizardAttendanceGate(panel, close, ws); }
    }));
    var footer = h('div', { className: 'modal-footer two-col' });
    footer.appendChild(h('button', { className: 'cancel-btn', text: '戻る', attrs: { type: 'button' }, onClick: function () { buildWizardStaffMulti(panel, close, ws); } }));
    footer.appendChild(h('button', { className: 'cancel-btn', text: 'キャンセル', attrs: { type: 'button' }, onClick: close }));
    panel.appendChild(footer);
  }

  // 退勤中の人が含まれる場合は、出勤打刻をどうするか確認してから登録する。
  function proceedToWizardAttendanceGate(panel, close, ws) {
    var absentOnes = ws.staffIds.map(findStaff).filter(function (s) { return s && s.attendance === 'absent'; });
    if (!absentOnes.length) { commitGroupWizard(ws, false); buildWizardAfterRegister(panel, close, ws); return; }
    panel.innerHTML = '';
    var names = absentOnes.map(function (s) { return s.name; }).join('、');
    panel.appendChild(modalHeader('出退勤の確認', names + 'さんは現在「退勤」状態です。'));
    var body = h('div', { className: 'modal-body big-choice-list' });
    body.appendChild(h('button', {
      className: 'choice-btn choice-add', attrs: { type: 'button' }, text: '出勤を記録して登録',
      onClick: function () { commitGroupWizard(ws, true); buildWizardAfterRegister(panel, close, ws); }
    }));
    body.appendChild(h('button', {
      className: 'choice-btn choice-neutral', attrs: { type: 'button' }, text: '配置だけ登録',
      onClick: function () { commitGroupWizard(ws, false); buildWizardAfterRegister(panel, close, ws); }
    }));
    panel.appendChild(body);
    panel.appendChild(cancelBar(close));
  }

  function commitGroupWizard(ws, markPresent) {
    var now = new Date();
    var g = findGroup(ws.groupId);
    if (ws.department === 'unyu') {
      ws.pairs.forEach(function (p) {
        assignStaffToGroup(p.staffId, ws.groupId, p.vehicleId);
        var s = findStaff(p.staffId);
        if (markPresent && s.attendance !== 'present') applyAttendanceChange(s, 'present', now);
      });
      ws.extraStaffIds.forEach(function (id) {
        assignStaffToGroup(id, ws.groupId, null);
        var s = findStaff(id);
        if (markPresent && s.attendance !== 'present') applyAttendanceChange(s, 'present', now);
      });
      (ws.extraVehicleIds || []).forEach(function (vid) { parkVehicleInGroup(vid, ws.groupId); });
    } else {
      ws.staffIds.forEach(function (id) {
        assignStaffToGroup(id, ws.groupId, null);
        var s = findStaff(id);
        if (markPresent && s.attendance !== 'present') applyAttendanceChange(s, 'present', now);
      });
    }
    var site = findSite(g.siteId);
    if (site) site.usageCount = (site.usageCount || 0) + ws.staffIds.length;
    persist();
    setLaneOpen(ws.department, ws.groupId, true);
    renderAll();
    var countLabel = ws.department === 'unyu' ? (ws.staffIds.length + '人・' + (ws.pairs.length + (ws.extraVehicleIds || []).length) + '台') : (ws.staffIds.length + '人');
    showToast(g.displayLabel + 'へ', countLabel + 'を登録しました');
  }

  function buildWizardAfterRegister(panel, close, ws) {
    panel.innerHTML = '';
    panel.appendChild(modalHeader('登録しました', '続けて同じ配置枠に登録しますか？'));
    var body = h('div', { className: 'modal-body big-choice-list' });
    body.appendChild(h('button', {
      className: 'choice-btn choice-add', attrs: { type: 'button' }, text: '同じ配置枠に追加登録',
      onClick: function () {
        ws.vehicleIds = []; ws.staffIds = []; ws.pairs = []; ws.extraStaffIds = []; ws.extraVehicleIds = []; ws.autoVehicleFor = {};
        if (ws.department === 'unyu') buildWizardDriverMultiUnyu(panel, close, ws);
        else buildWizardStaffMulti(panel, close, ws);
      }
    }));
    body.appendChild(h('button', {
      className: 'choice-btn choice-neutral', attrs: { type: 'button' }, text: '配車ボードへ戻る',
      onClick: close
    }));
    panel.appendChild(body);
  }

  // ============================================================
  // 従業員管理: 追加・編集・退職・再有効化・表示順・通常ダンプ・対応業務。
  // 氏名の新規登録・修正だけ文字入力、それ以外はすべてタップ操作。
  // ============================================================
  var DEPARTMENT_ORDER_ADMIN = ['doboku', 'unyu', 'office'];

  function openStaffAdmin() {
    openModal(function (panel, close) {
      buildStaffAdminContent(panel, close);
    });
  }

  var STAFF_ADMIN_FILTERS = [
    { key: 'all', label: '全員' },
    { key: 'doboku', label: '土木' },
    { key: 'unyu', label: '運輸' },
    { key: 'office', label: '事務' },
    { key: 'retired', label: '退職者' }
  ];

  function buildStaffAdminContent(panel, close, filter) {
    filter = filter || 'all';
    panel.innerHTML = '';
    var backHere = function () { buildStaffAdminContent(panel, close, filter); };
    panel.appendChild(modalHeader('従業員管理', '部門をタップして絞り込み、従業員をタップして編集してください'));
    panel.appendChild(filterChipRow(STAFF_ADMIN_FILTERS, filter, function (key) { buildStaffAdminContent(panel, close, key); }));

    var body = h('div', { className: 'modal-body scroll-list' });

    if (filter === 'retired') {
      var retired = sortByOrder(state.staff.filter(function (s) { return s.active === false; }));
      if (!retired.length) body.appendChild(h('p', { className: 'record-empty', text: '退職者はいません。' }));
      retired.forEach(function (s) {
        body.appendChild(h('button', {
          className: 'list-btn staff-admin-item', attrs: { type: 'button' },
          onClick: function () { buildStaffReactivateConfirm(panel, s.id, close, backHere); }
        }, [
          h('span', { className: 'list-btn-text', text: s.name }),
          h('span', { className: 'list-btn-tag', text: DEPT_LABELS[s.department] })
        ]));
      });
    } else {
      var depts = filter === 'all' ? DEPARTMENT_ORDER_ADMIN : [filter];
      var any = false;
      depts.forEach(function (dept) {
        var list = sortByOrder(state.staff.filter(function (s) { return s.department === dept && s.active !== false; }));
        if (!list.length) return;
        any = true;
        if (filter === 'all') body.appendChild(h('div', { className: 'records-section-title', text: DEPT_LABELS[dept] + '部門' }));
        list.forEach(function (s) {
          body.appendChild(h('button', {
            className: 'list-btn staff-admin-item', attrs: { type: 'button' },
            onClick: function () { buildStaffEditMenu(panel, s.id, close, backHere); }
          }, [
            h('span', { className: 'list-btn-text', text: s.name }),
            h('span', { className: 'status-badge ' + (s.attendance === 'present' ? 'status-available' : 'status-suspended'), text: s.attendance === 'present' ? '出勤' : '退勤' }),
            h('span', { className: 'list-btn-tag', text: (s.workRoles || []).map(function (r) { return ROLE_LABELS[r] || r; }).join('・') })
          ]));
        });
      });
      if (!any) body.appendChild(h('p', { className: 'record-empty', text: '該当する従業員がいません。' }));
    }

    panel.appendChild(body);

    panel.appendChild(h('button', {
      className: 'choice-btn choice-add', attrs: { type: 'button' }, text: '＋ 新しい従業員を追加',
      onClick: function () { buildStaffAddForm(panel, close, backHere); }
    }));
    panel.appendChild(cancelBar(close));
  }

  function roleToggleRow(selectedRoles, onChange) {
    var row = h('div', { className: 'role-btn-row' });
    var btns = {};
    [['civil', '土木作業'], ['dumpDriver', 'ダンプ運転'], ['office', '事務']].forEach(function (pair) {
      var key = pair[0], label = pair[1];
      var btn = h('button', {
        className: 'role-btn' + (selectedRoles.indexOf(key) !== -1 ? ' is-selected' : ''),
        attrs: { type: 'button' }, text: label,
        onClick: function () {
          var idx = selectedRoles.indexOf(key);
          if (idx !== -1) selectedRoles.splice(idx, 1); else selectedRoles.push(key);
          btn.classList.toggle('is-selected', selectedRoles.indexOf(key) !== -1);
          if (onChange) onChange();
        }
      });
      btns[key] = btn;
      row.appendChild(btn);
    });
    return row;
  }

  function departmentToggleRow(selected, onPick) {
    var row = h('div', { className: 'category-row' });
    var btns = {};
    [['doboku', '土木'], ['unyu', '運輸'], ['office', '事務']].forEach(function (pair) {
      var key = pair[0], label = pair[1];
      var btn = h('button', {
        className: 'category-btn' + (selected.value === key ? ' is-selected' : ''),
        attrs: { type: 'button' }, text: label,
        onClick: function () {
          selected.value = key;
          Object.keys(btns).forEach(function (k) { btns[k].classList.toggle('is-selected', k === key); });
          onPick(key);
        }
      });
      btns[key] = btn;
      row.appendChild(btn);
    });
    return row;
  }

  function vehiclePickRow(selected, onPick) {
    var body = h('div', { className: 'modal-body scroll-list' });
    body.appendChild(h('button', {
      className: 'list-btn' + (!selected.value ? ' is-selected' : ''), attrs: { type: 'button' },
      onClick: function () { selected.value = null; onPick(); }
    }, [h('span', { className: 'list-btn-text', text: '設定なし' })]));
    sortByOrder(state.vehicles.filter(function (v) { return v.active !== false; })).forEach(function (v) {
      body.appendChild(h('button', {
        className: 'list-btn' + (selected.value === v.id ? ' is-selected' : ''), attrs: { type: 'button' },
        onClick: function () { selected.value = v.id; onPick(); }
      }, [h('span', { className: 'list-btn-text', text: v.displayName })]));
    });
    return body;
  }

  function buildStaffAddForm(panel, close, onBack) {
    panel.innerHTML = '';
    panel.appendChild(modalHeader('新しい従業員を追加', '氏名を入力し、所属・対応業務・通常ダンプ・初期状態をタップで選んでください'));

    var body = h('div', { className: 'modal-body scroll-list' });
    var errorMsg = h('p', { className: 'form-error hidden' });
    var nameInput = h('input', { className: 'form-input', attrs: { type: 'text', inputmode: 'text', autocomplete: 'off', placeholder: '例：山田太郎' } });
    body.appendChild(h('label', { className: 'form-label', text: '氏名' }));
    body.appendChild(nameInput);
    body.appendChild(errorMsg);

    var deptSel = { value: 'doboku' };
    var roles = ['civil'];
    var vehicleSel = { value: null };
    var attendanceSel = { value: 'absent' };

    body.appendChild(h('label', { className: 'form-label', text: '基本所属' }));
    body.appendChild(departmentToggleRow(deptSel, function (key) {
      roles.length = 0;
      roles.push(key === 'doboku' ? 'civil' : key === 'unyu' ? 'dumpDriver' : 'office');
      rerenderRoles();
    }));

    body.appendChild(h('label', { className: 'form-label', text: '対応可能業務(複数選択可)' }));
    var roleRowHolder = h('div');
    body.appendChild(roleRowHolder);
    function rerenderRoles() {
      roleRowHolder.innerHTML = '';
      roleRowHolder.appendChild(roleToggleRow(roles, null));
    }
    rerenderRoles();

    body.appendChild(h('label', { className: 'form-label', text: '通常ダンプ' }));
    var vehicleLabel = h('div', { className: 'current-line', text: '選択中：設定なし' });
    body.appendChild(vehicleLabel);
    body.appendChild(h('button', {
      className: 'choice-btn choice-move', attrs: { type: 'button' }, text: '通常ダンプを選ぶ',
      onClick: function () {
        panel.innerHTML = '';
        panel.appendChild(modalHeader('通常ダンプを選択', 'タップして選んでください'));
        panel.appendChild(vehiclePickRow(vehicleSel, function () { buildStaffAddForm(panel, close, onBack); }));
        panel.appendChild(cancelBar(function () { buildStaffAddForm(panel, close, onBack); }));
      }
    }));
    if (vehicleSel.value) vehicleLabel.textContent = '選択中：' + findVehicle(vehicleSel.value).displayName;

    body.appendChild(h('label', { className: 'form-label', text: '初期状態' }));
    var attRow = h('div', { className: 'category-row' });
    var attBtns = {};
    [['absent', '退勤'], ['present', '出勤']].forEach(function (pair) {
      var key = pair[0], label = pair[1];
      var btn = h('button', {
        className: 'category-btn' + (attendanceSel.value === key ? ' is-selected' : ''),
        attrs: { type: 'button' }, text: label,
        onClick: function () {
          attendanceSel.value = key;
          Object.keys(attBtns).forEach(function (k) { attBtns[k].classList.toggle('is-selected', k === key); });
        }
      });
      attBtns[key] = btn;
      attRow.appendChild(btn);
    });
    body.appendChild(attRow);

    panel.appendChild(body);
    var footer = h('div', { className: 'modal-footer two-col' });
    footer.appendChild(h('button', { className: 'cancel-btn', text: '戻る', attrs: { type: 'button' }, onClick: onBack }));
    footer.appendChild(h('button', {
      className: 'save-btn', text: '保存', attrs: { type: 'button' },
      onClick: function () {
        var trimmed = nameInput.value.trim();
        if (!trimmed) {
          errorMsg.textContent = '氏名を入力してください。';
          errorMsg.classList.remove('hidden');
          return;
        }
        var sameDept = state.staff.filter(function (s) { return s.department === deptSel.value; });
        var maxOrder = sameDept.reduce(function (m, s) { return Math.max(m, s.order || 0); }, 0);
        var staff = {
          id: genId('staff'), name: trimmed, department: deptSel.value, workRoles: roles.slice(),
          attendance: attendanceSel.value, normalVehicleId: vehicleSel.value, todayVehicleId: null,
          todayGroupId: null, order: maxOrder + 1, active: true
        };
        state.staff.push(staff);
        persist();
        renderAll();
        showToast(trimmed, DEPT_LABELS[deptSel.value] + '部門に追加しました');
        onBack();
      }
    }));
    panel.appendChild(footer);
    nameInput.focus();
  }

  function buildStaffEditMenu(panel, staffId, close, onBack) {
    panel.innerHTML = '';
    var s = findStaff(staffId);
    var backHere = function () { buildStaffEditMenu(panel, staffId, close, onBack); };
    var vehicle = s.normalVehicleId ? findVehicle(s.normalVehicleId) : null;
    panel.appendChild(modalHeader(s.name + ' さんの編集', '変更する項目を選んでください'));
    panel.appendChild(h('div', {
      className: 'current-line',
      text: DEPT_LABELS[s.department] + ' ／ ' + (s.workRoles || []).map(function (r) { return ROLE_LABELS[r] || r; }).join('・') +
        ' ／ 通常ダンプ：' + (vehicle ? vehicle.displayName : '設定なし')
    }));

    var body = h('div', { className: 'modal-body big-choice-list' });
    body.appendChild(h('button', {
      className: 'choice-btn choice-move', attrs: { type: 'button' }, text: '氏名を修正',
      onClick: function () { buildStaffRenameForm(panel, staffId, close, backHere); }
    }));
    body.appendChild(h('button', {
      className: 'choice-btn choice-move', attrs: { type: 'button' }, text: '所属を変更',
      onClick: function () { buildStaffDeptChange(panel, staffId, close, backHere); }
    }));
    body.appendChild(h('button', {
      className: 'choice-btn choice-move', attrs: { type: 'button' }, text: '対応可能業務を変更',
      onClick: function () { buildStaffRolesChange(panel, staffId, close, backHere); }
    }));
    body.appendChild(h('button', {
      className: 'choice-btn choice-move', attrs: { type: 'button' }, text: '通常ダンプを設定',
      onClick: function () {
        panel.innerHTML = '';
        panel.appendChild(modalHeader(s.name + 'さんの通常ダンプ', 'タップして選んでください'));
        var selRef = { value: s.normalVehicleId };
        panel.appendChild(vehiclePickRow(selRef, function () {
          s.normalVehicleId = selRef.value;
          persist(); renderAll();
          backHere();
        }));
        panel.appendChild(cancelBar(backHere));
      }
    }));
    body.appendChild(h('button', {
      className: 'choice-btn choice-move', attrs: { type: 'button' }, text: '表示順を変更',
      onClick: function () { buildStaffReorder(panel, staffId, close, backHere); }
    }));
    body.appendChild(h('button', {
      className: 'choice-btn choice-absent', attrs: { type: 'button' }, text: '退職扱いにする',
      onClick: function () { buildStaffRetireConfirm(panel, staffId, close, backHere); }
    }));

    panel.appendChild(body);
    var footer = h('div', { className: 'modal-footer two-col' });
    footer.appendChild(h('button', { className: 'cancel-btn', text: '戻る', attrs: { type: 'button' }, onClick: onBack }));
    footer.appendChild(h('button', { className: 'cancel-btn', text: 'キャンセル', attrs: { type: 'button' }, onClick: close }));
    panel.appendChild(footer);
  }

  function buildStaffRenameForm(panel, staffId, close, onBack) {
    panel.innerHTML = '';
    var s = findStaff(staffId);
    panel.appendChild(modalHeader('氏名を修正', '新しい氏名を入力してください'));
    var body = h('div', { className: 'modal-body' });
    var errorMsg = h('p', { className: 'form-error hidden' });
    var input = h('input', { className: 'form-input', attrs: { type: 'text', inputmode: 'text', autocomplete: 'off' } });
    input.value = s.name;
    body.appendChild(h('label', { className: 'form-label', text: '氏名' }));
    body.appendChild(input);
    body.appendChild(errorMsg);
    panel.appendChild(body);
    var footer = h('div', { className: 'modal-footer two-col' });
    footer.appendChild(h('button', { className: 'cancel-btn', text: '戻る', attrs: { type: 'button' }, onClick: onBack }));
    footer.appendChild(h('button', {
      className: 'save-btn', text: '保存', attrs: { type: 'button' },
      onClick: function () {
        var trimmed = input.value.trim();
        if (!trimmed) { errorMsg.textContent = '氏名を入力してください。'; errorMsg.classList.remove('hidden'); return; }
        s.name = trimmed;
        persist(); renderAll();
        onBack();
      }
    }));
    panel.appendChild(footer);
    input.focus();
  }

  function buildStaffDeptChange(panel, staffId, close, onBack) {
    panel.innerHTML = '';
    var s = findStaff(staffId);
    panel.appendChild(modalHeader(s.name + 'さんの所属を変更', 'タップして選んでください'));
    var body = h('div', { className: 'modal-body big-choice-list' });
    [['doboku', '土木'], ['unyu', '運輸'], ['office', '事務']].forEach(function (pair) {
      var key = pair[0], label = pair[1];
      body.appendChild(h('button', {
        className: 'choice-btn choice-neutral' + (s.department === key ? ' is-current' : ''), attrs: { type: 'button' },
        onClick: function () {
          s.department = key;
          persist(); renderAll();
          onBack();
        }
      }, [
        h('span', { className: 'choice-text', text: label }),
        s.department === key ? h('span', { className: 'current-badge', text: '現在' }) : null
      ]));
    });
    panel.appendChild(body);
    panel.appendChild(cancelBar(onBack));
  }

  function buildStaffRolesChange(panel, staffId, close, onBack) {
    panel.innerHTML = '';
    var s = findStaff(staffId);
    panel.appendChild(modalHeader(s.name + 'さんの対応可能業務', 'タップして切り替えてください(複数選択可)'));
    var body = h('div', { className: 'modal-body' });
    var roles = (s.workRoles || []).slice();
    body.appendChild(roleToggleRow(roles, null));
    panel.appendChild(body);
    var footer = h('div', { className: 'modal-footer two-col' });
    footer.appendChild(h('button', { className: 'cancel-btn', text: '戻る', attrs: { type: 'button' }, onClick: onBack }));
    footer.appendChild(h('button', {
      className: 'save-btn', text: '保存', attrs: { type: 'button' },
      onClick: function () { s.workRoles = roles.slice(); persist(); renderAll(); onBack(); }
    }));
    panel.appendChild(footer);
  }

  function buildStaffReorder(panel, staffId, close, onBack) {
    panel.innerHTML = '';
    var s = findStaff(staffId);
    var siblings = sortByOrder(state.staff.filter(function (x) { return x.department === s.department && x.active !== false; }));
    var idx = siblings.indexOf(s);
    panel.appendChild(modalHeader(s.name + 'さんの表示順', '▲▼で順番を入れ替えてください'));
    var body = h('div', { className: 'modal-body scroll-list' });
    siblings.forEach(function (x, i) {
      var row = h('div', { className: 'reorder-row list-btn' }, [
        h('span', { className: 'list-btn-text', text: x.name + (x.id === s.id ? '(選択中)' : '') },),
        h('button', {
          className: 'reorder-btn', attrs: { type: 'button' }, text: '▲', disabled: i === 0,
          onClick: function () { swapOrder(siblings, i, i - 1); persist(); renderAll(); buildStaffReorder(panel, staffId, close, onBack); }
        }),
        h('button', {
          className: 'reorder-btn', attrs: { type: 'button' }, text: '▼', disabled: i === siblings.length - 1,
          onClick: function () { swapOrder(siblings, i, i + 1); persist(); renderAll(); buildStaffReorder(panel, staffId, close, onBack); }
        })
      ]);
      body.appendChild(row);
    });
    panel.appendChild(body);
    panel.appendChild(cancelBar(onBack));
  }

  function swapOrder(list, i, j) {
    if (j < 0 || j >= list.length) return;
    var tmp = list[i].order;
    list[i].order = list[j].order;
    list[j].order = tmp;
  }

  function buildStaffRetireConfirm(panel, staffId, close, onBack) {
    panel.innerHTML = '';
    var s = findStaff(staffId);
    panel.appendChild(modalHeader(s.name + 'さんを退職扱いにしますか？', '過去の出退勤記録は保持されます。'));
    var body = h('div', { className: 'modal-body big-choice-list' });
    body.appendChild(h('button', {
      className: 'choice-btn choice-absent', attrs: { type: 'button' }, text: '退職扱いにする',
      onClick: function () {
        removeStaffFromGroup(s);
        s.active = false;
        persist(); renderAll();
        showToast(s.name, '退職扱いにしました');
        close();
      }
    }));
    panel.appendChild(body);
    panel.appendChild(cancelBar(onBack));
  }

  function buildStaffReactivateConfirm(panel, staffId, close, onBack) {
    panel.innerHTML = '';
    var s = findStaff(staffId);
    panel.appendChild(modalHeader(s.name + 'さんを再有効化しますか？', '通常勤務の対象に戻します。'));
    var body = h('div', { className: 'modal-body big-choice-list' });
    body.appendChild(h('button', {
      className: 'choice-btn choice-add', attrs: { type: 'button' }, text: '再有効化する',
      onClick: function () { s.active = true; persist(); renderAll(); showToast(s.name, '再有効化しました'); close(); }
    }));
    panel.appendChild(body);
    panel.appendChild(cancelBar(onBack));
  }

  // ============================================================
  // 出退勤記録: イベントログの集計とCSV出力(日次・月次)
  // ============================================================
  var CSV_HEADERS = ['日付', '所属', '氏名', '出勤時刻', '退勤時刻', '勤務時間', '残業'];
  var DEPT_ORDER_BY_LABEL = { '土木': 1, '運輸': 2, '事務': 3, '共通': 4 };
  function deptRank(label) { return DEPT_ORDER_BY_LABEL[label] || 9; }

  function csvEscape(v) {
    v = (v == null) ? '' : String(v);
    if (/[",\r\n]/.test(v)) v = '"' + v.replace(/"/g, '""') + '"';
    return v;
  }

  function aggregatePersonDay(events) {
    var sorted = events.slice().sort(function (a, b) { return a.timestamp < b.timestamp ? -1 : (a.timestamp > b.timestamp ? 1 : 0); });
    var ins = sorted.filter(function (e) { return e.action === 'clockIn'; });
    var outs = sorted.filter(function (e) { return e.action === 'clockOut'; });
    var last = sorted[sorted.length - 1];
    var staff = findStaff(last.personId);
    return {
      date: last.date,
      personId: last.personId,
      personName: last.personName,
      department: last.department,
      clockInIso: ins.length ? ins[0].timestamp : null,
      clockOutIso: outs.length ? outs[outs.length - 1].timestamp : null,
      overtimeHours: outs.length ? (outs[outs.length - 1].overtimeHours || 0) : 0,
      _order: staff ? (staff.order || 0) : 999
    };
  }

  function buildDailyAggregatedRows(dateStr) {
    var byPerson = {};
    state.attendanceLogs.forEach(function (r) {
      if (r.date !== dateStr) return;
      (byPerson[r.personId] = byPerson[r.personId] || []).push(r);
    });
    var rows = Object.keys(byPerson).map(function (personId) { return aggregatePersonDay(byPerson[personId]); });
    rows.sort(function (a, b) {
      var dr = deptRank(a.department) - deptRank(b.department);
      if (dr !== 0) return dr;
      if (a._order !== b._order) return a._order - b._order;
      return a.personName < b.personName ? -1 : (a.personName > b.personName ? 1 : 0);
    });
    return rows;
  }

  function buildMonthlyAggregatedRows(year, month) {
    var prefix = year + '-' + pad2(month) + '-';
    var byDatePerson = {};
    state.attendanceLogs.forEach(function (r) {
      if (r.date.indexOf(prefix) !== 0) return;
      var key = r.date + '|' + r.personId;
      (byDatePerson[key] = byDatePerson[key] || []).push(r);
    });
    var rows = Object.keys(byDatePerson).map(function (key) { return aggregatePersonDay(byDatePerson[key]); });
    rows.sort(function (a, b) {
      if (a.date !== b.date) return a.date < b.date ? -1 : 1;
      var dr = deptRank(a.department) - deptRank(b.department);
      if (dr !== 0) return dr;
      if (a._order !== b._order) return a._order - b._order;
      return a.personName < b.personName ? -1 : (a.personName > b.personName ? 1 : 0);
    });
    return rows;
  }

  function summarizeRow(row) {
    var clockInStr = row.clockInIso ? formatTimeHM(row.clockInIso) : '';
    var clockOutStr = row.clockOutIso ? formatTimeHM(row.clockOutIso) : '';
    var duration = '';
    if (row.clockInIso && row.clockOutIso) {
      var startMs = new Date(row.clockInIso).getTime();
      var endMs = new Date(row.clockOutIso).getTime();
      duration = endMs < startMs ? '要確認' : formatDurationHM(row.clockInIso, row.clockOutIso);
    }
    var overtimeStr = row.overtimeHours ? row.overtimeHours + '時間' : '';
    return { clockInStr: clockInStr, clockOutStr: clockOutStr, duration: duration, overtimeStr: overtimeStr };
  }

  function buildCsv(rows) {
    var lines = [CSV_HEADERS.map(csvEscape).join(',')];
    rows.forEach(function (row) {
      var sum = summarizeRow(row);
      lines.push([row.date, row.department, row.personName, sum.clockInStr, sum.clockOutStr, sum.duration, sum.overtimeStr].map(csvEscape).join(','));
    });
    return '﻿' + lines.join('\r\n');
  }

  function downloadCsv(filename, csvContent) {
    var blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    var url = URL.createObjectURL(blob);
    var a = h('a', { attrs: { href: url, download: filename } });
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    setTimeout(function () { URL.revokeObjectURL(url); }, 1000);
  }

  var RECORDS_FILTERS = [
    { key: 'all', label: '全員' },
    { key: 'doboku', label: '土木' },
    { key: 'unyu', label: '運輸' },
    { key: 'office', label: '事務' }
  ];

  function openRecordsModal() {
    openModal(function (panel, close) {
      var today = new Date();
      buildRecordsContent(panel, close, today, { year: today.getFullYear(), month: today.getMonth() + 1 }, 'summary', 'all');
    });
  }

  function shiftDate(d, days) {
    return new Date(d.getFullYear(), d.getMonth(), d.getDate() + days);
  }

  function shiftMonth(ym, delta) {
    var total = ym.year * 12 + (ym.month - 1) + delta;
    var year = Math.floor(total / 12);
    var month = (total % 12) + 1;
    return { year: year, month: month };
  }

  function buildRecordsContent(panel, close, dailyDate, monthYm, dailyView, deptFilter) {
    deptFilter = deptFilter || 'all';
    var deptLabelFilter = deptFilter === 'all' ? null : DEPT_LABELS[deptFilter];
    panel.innerHTML = '';
    panel.appendChild(modalHeader('出退勤記録', '日付・月を選んでCSV(Excelで開けます)をダウンロード、または操作履歴を確認できます'));

    var body = h('div', { className: 'modal-body scroll-list' });
    var statusMsg = h('p', { className: 'download-status' });

    body.appendChild(filterChipRow(RECORDS_FILTERS, deptFilter, function (key) { buildRecordsContent(panel, close, dailyDate, monthYm, dailyView, key); }));

    body.appendChild(h('div', { className: 'records-section-title', text: '日次(1日分)' }));
    var dailyNav = h('div', { className: 'date-nav-row' }, [
      h('button', {
        className: 'date-nav-btn', text: '◀ 前日', attrs: { type: 'button' },
        onClick: function () { buildRecordsContent(panel, close, shiftDate(dailyDate, -1), monthYm, dailyView, deptFilter); }
      }),
      h('div', { className: 'date-display', text: formatDateJP(dailyDate) }),
      h('button', {
        className: 'date-nav-btn', text: '翌日 ▶', attrs: { type: 'button' },
        onClick: function () { buildRecordsContent(panel, close, shiftDate(dailyDate, 1), monthYm, dailyView, deptFilter); }
      })
    ]);
    body.appendChild(dailyNav);

    var dateStr = formatYMD(dailyDate);

    var tabRow = h('div', { className: 'tab-row' }, [
      h('button', {
        className: 'tab-btn' + (dailyView === 'summary' ? ' is-active' : ''),
        attrs: { type: 'button' }, text: '日次集計',
        onClick: function () { buildRecordsContent(panel, close, dailyDate, monthYm, 'summary', deptFilter); }
      }),
      h('button', {
        className: 'tab-btn' + (dailyView === 'history' ? ' is-active' : ''),
        attrs: { type: 'button' }, text: '操作履歴',
        onClick: function () { buildRecordsContent(panel, close, dailyDate, monthYm, 'history', deptFilter); }
      })
    ]);
    body.appendChild(tabRow);

    if (dailyView === 'history') {
      var events = state.attendanceLogs.filter(function (r) { return r.date === dateStr && (!deptLabelFilter || r.department === deptLabelFilter); })
        .slice().sort(function (a, b) { return a.timestamp < b.timestamp ? -1 : (a.timestamp > b.timestamp ? 1 : 0); });
      if (!events.length) {
        body.appendChild(h('p', { className: 'record-empty', text: 'この日の操作履歴はありません。' }));
      } else {
        events.forEach(function (e) {
          body.appendChild(h('div', { className: 'history-row' }, [
            h('span', { className: 'history-time', text: formatTimeHM(e.timestamp) }),
            h('span', { className: 'history-name', text: e.personName }),
            h('span', { className: 'history-action history-action-' + e.action, text: e.action === 'clockIn' ? '出勤' : '退勤' }),
            (e.action === 'clockOut' && e.overtimeHours) ? h('span', { className: 'history-overtime', text: '残業' + e.overtimeHours + '時間' }) : null
          ]));
        });
      }
    } else {
      var summaryRows = buildDailyAggregatedRows(dateStr).filter(function (r) { return !deptLabelFilter || r.department === deptLabelFilter; });
      if (!summaryRows.length) {
        body.appendChild(h('p', { className: 'record-empty', text: 'この日の記録はまだありません。' }));
      } else {
        body.appendChild(h('div', { className: 'record-row record-row-header' }, [
          h('span', { className: 'record-col record-col-name', text: '氏名' }),
          h('span', { className: 'record-col record-col-dept', text: '所属' }),
          h('span', { className: 'record-col record-col-time', text: '出勤' }),
          h('span', { className: 'record-col record-col-time', text: '退勤' }),
          h('span', { className: 'record-col record-col-dur', text: '勤務時間' }),
          h('span', { className: 'record-col record-col-ot', text: '残業' })
        ]));
        summaryRows.forEach(function (row) {
          var sum = summarizeRow(row);
          body.appendChild(h('div', { className: 'record-row' }, [
            h('span', { className: 'record-col record-col-name', text: row.personName }),
            h('span', { className: 'record-col record-col-dept', text: row.department }),
            h('span', { className: 'record-col record-col-time', text: sum.clockInStr }),
            h('span', { className: 'record-col record-col-time', text: sum.clockOutStr }),
            h('span', { className: 'record-col record-col-dur' + (sum.duration === '要確認' ? ' is-warning' : ''), text: sum.duration }),
            h('span', { className: 'record-col record-col-ot', text: sum.overtimeStr })
          ]));
        });
      }
    }

    body.appendChild(h('button', {
      className: 'choice-btn choice-download',
      attrs: { type: 'button' },
      text: deptFilter === 'all' ? 'この日の記録をCSVダウンロード' : 'この日の記録をCSVダウンロード(全員)',
      onClick: function () {
        var rows = buildDailyAggregatedRows(dateStr);
        downloadCsv('attendance_' + dateStr + '.csv', buildCsv(rows));
        statusMsg.textContent = rows.length ? '✔ ' + dateStr + ' の記録(' + rows.length + '人分)をダウンロードしました。' : '※ この日の記録はまだありません(0件で出力しました)。';
      }
    }));
    if (deptFilter !== 'all') {
      body.appendChild(h('button', {
        className: 'choice-btn choice-download',
        attrs: { type: 'button' },
        text: 'この日の記録をCSVダウンロード(' + deptLabelFilter + 'だけ)',
        onClick: function () {
          var rows = buildDailyAggregatedRows(dateStr).filter(function (r) { return r.department === deptLabelFilter; });
          downloadCsv('attendance_' + dateStr + '_' + deptFilter + '.csv', buildCsv(rows));
          statusMsg.textContent = rows.length ? '✔ ' + dateStr + ' の' + deptLabelFilter + 'の記録(' + rows.length + '人分)をダウンロードしました。' : '※ この日の' + deptLabelFilter + 'の記録はまだありません(0件で出力しました)。';
        }
      }));
    }

    body.appendChild(h('div', { className: 'records-section-title', text: '月次(1か月分)' }));
    var monthNav = h('div', { className: 'date-nav-row' }, [
      h('button', {
        className: 'date-nav-btn', text: '◀ 前月', attrs: { type: 'button' },
        onClick: function () { buildRecordsContent(panel, close, dailyDate, shiftMonth(monthYm, -1), dailyView, deptFilter); }
      }),
      h('div', { className: 'date-display', text: monthYm.year + '年' + monthYm.month + '月' }),
      h('button', {
        className: 'date-nav-btn', text: '翌月 ▶', attrs: { type: 'button' },
        onClick: function () { buildRecordsContent(panel, close, dailyDate, shiftMonth(monthYm, 1), dailyView, deptFilter); }
      })
    ]);
    body.appendChild(monthNav);
    body.appendChild(h('button', {
      className: 'choice-btn choice-download',
      attrs: { type: 'button' },
      text: deptFilter === 'all' ? 'この月の記録をCSVダウンロード' : 'この月の記録をCSVダウンロード(全員)',
      onClick: function () {
        var rows = buildMonthlyAggregatedRows(monthYm.year, monthYm.month);
        var label = monthYm.year + '-' + pad2(monthYm.month);
        downloadCsv('attendance_' + label + '.csv', buildCsv(rows));
        statusMsg.textContent = rows.length ? '✔ ' + monthYm.year + '年' + monthYm.month + '月 の記録(' + rows.length + '件)をダウンロードしました。' : '※ この月の記録はまだありません(0件で出力しました)。';
      }
    }));
    if (deptFilter !== 'all') {
      body.appendChild(h('button', {
        className: 'choice-btn choice-download',
        attrs: { type: 'button' },
        text: 'この月の記録をCSVダウンロード(' + deptLabelFilter + 'だけ)',
        onClick: function () {
          var rows = buildMonthlyAggregatedRows(monthYm.year, monthYm.month).filter(function (r) { return r.department === deptLabelFilter; });
          var label = monthYm.year + '-' + pad2(monthYm.month) + '_' + deptFilter;
          downloadCsv('attendance_' + label + '.csv', buildCsv(rows));
          statusMsg.textContent = rows.length ? '✔ ' + monthYm.year + '年' + monthYm.month + '月 の' + deptLabelFilter + 'の記録(' + rows.length + '件)をダウンロードしました。' : '※ この月の' + deptLabelFilter + 'の記録はまだありません(0件で出力しました)。';
        }
      }));
    }

    body.appendChild(statusMsg);

    panel.appendChild(body);
    panel.appendChild(cancelBar(close));
  }

  document.addEventListener('DOMContentLoaded', init);
})();
