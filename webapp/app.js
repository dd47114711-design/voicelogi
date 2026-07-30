/*
 * app.js
 * ---------------------------------------------------------------
 * 画面描画とタップ操作のロジック。
 * データの読み書きは必ず Storage 経由(storage.js)で行い、
 * この中に localStorage の呼び出しを直接書かない
 * (将来サーバーDBへ差し替えるときに、この分離を保つため)。
 */
(function () {
  'use strict';

  var state = null;

  var VEHICLE_STATUS_LABELS = {
    available: '使用可能',
    inspection: '車検',
    maintenance: '整備',
    broken: '故障',
    suspended: '使用停止'
  };
  var VEHICLE_STATUS_ORDER = ['available', 'inspection', 'maintenance', 'broken', 'suspended'];
  var DEPT_LABELS = { doboku: '土木', unyu: '運輸', common: '共通' };

  // ============================================================
  // 起動処理
  // ============================================================
  function init() {
    state = loadOrInitState();
    scaleUI();
    window.addEventListener('resize', scaleUI);

    document.getElementById('btn-fullscreen').addEventListener('click', toggleFullscreen);
    document.getElementById('btn-vehicle-admin').addEventListener('click', function () {
      openVehicleAdmin();
    });
    document.getElementById('btn-records').addEventListener('click', function () {
      openRecordsModal();
    });
    document.getElementById('btn-dispatch-register').addEventListener('click', function () {
      openDispatchWizard();
    });
    document.getElementById('btn-doboku-expand-all').addEventListener('click', function () { setAllLanesOpen('doboku', true); });
    document.getElementById('btn-doboku-collapse-all').addEventListener('click', function () { setAllLanesOpen('doboku', false); });
    document.getElementById('btn-unyu-expand-all').addEventListener('click', function () { setAllLanesOpen('unyu', true); });
    document.getElementById('btn-unyu-collapse-all').addEventListener('click', function () { setAllLanesOpen('unyu', false); });

    updateClock();
    setInterval(updateClock, 1000);

    renderAll();
  }

  function loadOrInitState() {
    var loaded = Storage.loadState();
    if (!loaded || !loaded.staff || !loaded.sites || !loaded.vehicles) {
      var fresh = createSeedState();
      Storage.saveState(fresh);
      return fresh;
    }
    // 旧バージョンのデータに出退勤記録が無い場合は追加しておく
    if (!loaded.attendanceLogs) loaded.attendanceLogs = [];
    if (migrateAttendanceLogs(loaded)) Storage.saveState(loaded);
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
          id: r.id + '_in',
          personId: r.staffId,
          personName: r.staffName,
          department: deptLabel,
          action: 'clockIn',
          timestamp: r.clockIn,
          date: r.date,
          createdAt: r.clockIn
        });
      }
      if (r.clockOut) {
        migrated.push({
          id: r.id + '_out',
          personId: r.staffId,
          personName: r.staffName,
          department: deptLabel,
          action: 'clockOut',
          timestamp: r.clockOut,
          date: r.date,
          createdAt: r.clockOut
        });
      }
    });
    loaded.attendanceLogs = migrated;
    return true;
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

  // ============================================================
  // 状態変更(すべての変更はここを通り、保存 + 再描画する)
  // ============================================================
  // 出勤・退勤の状態変更+イベントログへの追加(過去のイベントは上書きしない)。
  // 保存・再描画・トースト表示は行わない下位処理(setAttendanceと、配車登録
  // ウィザードなど「登録と同時に出勤扱いにする」処理の両方から使う)。
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

  // 出勤・退勤の確定処理。
  // 1.対象者を特定 → 2.状態を更新 → 3.現在日時を取得 →
  // 4.イベントログへ追加(過去のイベントは上書きしない) → 5.保存 →
  // 6.画面へ反映 → 7.記録完了メッセージを表示、の順で行う。
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

  function setStaffSite(staffId, siteId) {
    var s = findStaff(staffId);
    if (!s) return;
    s.todaySiteId = siteId;
    if (siteId) {
      var site = findSite(siteId);
      if (site) site.usageCount = (site.usageCount || 0) + 1;
    }
    persist();
    renderAll();
  }

  // value: null = 通常ダンプに戻す / 'UNASSIGNED' = 未割当 / vehicleId = その日だけ変更
  function setStaffVehicle(staffId, value) {
    var s = findStaff(staffId);
    if (!s) return;
    s.todayVehicleId = value;
    persist();
    renderAll();
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

  function effectiveVehicleId(staff) {
    if (staff.todayVehicleId === null || staff.todayVehicleId === undefined) {
      return staff.normalVehicleId || null;
    }
    if (staff.todayVehicleId === 'UNASSIGNED') return null;
    return staff.todayVehicleId;
  }

  function isOverridden(staff) {
    return staff.todayVehicleId !== null && staff.todayVehicleId !== undefined;
  }

  // ============================================================
  // 二重登録防止(1人の運転手・1台のダンプは同時に1つの配車だけ)
  // ============================================================
  // 指定した車両を「今日実際に使っている(出勤中の)」人を1人だけ返す。
  // 退勤中の人の通常ダンプは「空車」として扱うため、ここでは対象にしない。
  function findDriverUsingVehicle(vehicleId, exceptStaffId) {
    return state.staff.find(function (s) {
      if (s.id === exceptStaffId) return false;
      if (s.active === false) return false;
      if (s.attendance !== 'present') return false;
      return effectiveVehicleId(s) === vehicleId;
    }) || null;
  }

  // 指定した車両を他の誰かが使っていた場合、その人を明示的に未割当へ戻す。
  // (通常ダンプの設定自体は変更しない)
  function releaseVehicleFromOthers(vehicleId, exceptStaffId) {
    state.staff.forEach(function (s) {
      if (s.id === exceptStaffId) return;
      if (effectiveVehicleId(s) === vehicleId) {
        s.todayVehicleId = 'UNASSIGNED';
      }
    });
  }

  // ある現場に今日配車されている(車両を持っている)運輸部門の人数を数える。
  function countVehiclesAtSite(siteId) {
    return state.staff.filter(function (s) {
      return s.department === 'unyu' && s.active !== false && s.todaySiteId === siteId && effectiveVehicleId(s);
    }).length;
  }

  // ある人が「既に別の現場へ配車済み」かどうか(移動確認の要否判定に使う)。
  // normalVehicleIdはほぼ全員が持つ既定値であり単独では「配車済み」を
  // 意味しないため、実際に現場(todaySiteId)が設定されている場合のみ判定する。
  function isDriverAlreadyDispatched(driver, targetSiteId) {
    return !!(driver.todaySiteId && driver.todaySiteId !== targetSiteId);
  }

  // ============================================================
  // 縦書き表示ヘルパー
  // 実物の札と同じく、名前・現場・ダンプの文字は縦書きで表示する。
  // 数字の連続(例:「10tダンプ16」の「10」「16」)は縦中横で横向きに
  // まとめて表示し、実物の札の見た目に近づける。
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
  // メイン画面描画: 現場ごとの行(レーン)を組み立てる
  // ------------------------------------------------------------
  // 画面の主軸は「人」ではなく「現場」。
  //   現場一覧 → 各現場に所属している人を抽出 → その現場行にまとめて表示
  // という順で毎回組み立て直す。内部データ(state.staff)は人ごとのままで、
  // 表示のときだけ現場ごとにグルーピングする。
  // ============================================================
  function renderAll() {
    renderDepartment('doboku-list', 'doboku', buildDobokuMember);
    renderDepartment('unyu-list', 'unyu', buildUnyuMember);
    renderVehicleSummaryBar();
  }

  var DEPARTMENT_RENDERERS = {
    doboku: { containerId: 'doboku-list', buildMemberFn: buildDobokuMember },
    unyu: { containerId: 'unyu-list', buildMemberFn: buildUnyuMember }
  };
  function rerenderDepartment(department) {
    var cfg = DEPARTMENT_RENDERERS[department];
    renderDepartment(cfg.containerId, department, cfg.buildMemberFn);
  }

  // ------------------------------------------------------------
  // 現場行(レーン)の開閉状態。最大15現場・20台を扱う前提のため、
  // 見出しをタップして開閉できるようにし、無理に1画面へ詰め込まない。
  // (保存はせず、画面を開いている間だけ保持する)
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

  function buildDepartmentLanes(department) {
    var deptStaff = state.staff.filter(function (s) { return s.department === department && s.active !== false; });
    var presentStaff = deptStaff.filter(function (s) { return s.attendance === 'present'; });
    var absentStaff = deptStaff.filter(function (s) { return s.attendance === 'absent'; });

    var lanes = [];

    var sites = state.sites.filter(function (site) {
      return site.status === 'active' && (site.category === department || site.category === 'common');
    });
    sites.sort(function (a, b) {
      var diff = (b.usageCount || 0) - (a.usageCount || 0);
      if (diff !== 0) return diff;
      return (a.order || 0) - (b.order || 0);
    });

    sites.forEach(function (site) {
      var members = sortByOrder(presentStaff.filter(function (s) { return s.todaySiteId === site.id; }));
      if (members.length) {
        lanes.push({ kind: 'site', key: site.id, label: site.name, members: members });
      }
    });

    var unassigned = sortByOrder(presentStaff.filter(function (s) { return !s.todaySiteId; }));
    if (unassigned.length) {
      lanes.push({ kind: 'unassigned', key: 'UNASSIGNED', label: '現場未定', members: unassigned });
    }

    if (department === 'unyu') {
      // 空車判定は部門をまたいで行う(土木の人がダンプに乗っている日もあるため)。
      var usedVehicleIds = {};
      state.staff.filter(function (s) { return s.attendance === 'present' && s.active !== false; }).forEach(function (s) {
        var vid = effectiveVehicleId(s);
        if (vid) usedVehicleIds[vid] = true;
      });
      var vehicles = sortByOrder(state.vehicles.filter(function (v) { return v.active !== false; }));

      var idleVehicles = vehicles.filter(function (v) { return v.status === 'available' && !usedVehicleIds[v.id]; });
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

    if (absentStaff.length) {
      lanes.push({ kind: 'absent', key: 'ABSENT', label: '休み', members: sortByOrder(absentStaff) });
    }

    return lanes;
  }

  // 車両20台全体の集計(使用中・空車・整備・車検・故障・使用停止)。
  // 未知の状態値が混ざっている場合は unknown に計上し、警告表示に使う。
  function computeVehicleSummary() {
    var vehicles = state.vehicles.filter(function (v) { return v.active !== false; });
    var usedIds = {};
    // 土木の人が乗っている場合も「使用中」に含めるため、部門を問わず全員を見る。
    state.staff.filter(function (s) { return s.attendance === 'present' && s.active !== false; })
      .forEach(function (s) { var vid = effectiveVehicleId(s); if (vid) usedIds[vid] = true; });

    var counts = { inUse: 0, idle: 0, maintenance: 0, inspection: 0, broken: 0, suspended: 0, unknown: 0 };
    vehicles.forEach(function (v) {
      if (v.status === 'available') {
        if (usedIds[v.id]) counts.inUse++; else counts.idle++;
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

  function buildLaneEl(lane, department, buildMemberFn) {
    var count = lane.kind === 'vehicle' ? lane.vehicles.length : lane.members.length;
    var unit = lane.kind === 'vehicle' ? '台' : '人';
    var open = isLaneOpen(department, lane.key);

    var header = h('button', {
      className: 'lane-header',
      attrs: { type: 'button' },
      onClick: function () { toggleLane(department, lane.key); }
    }, [
      h('span', { className: 'lane-title-group' }, [
        h('span', { className: 'lane-chevron', text: open ? '▼' : '▶' }),
        h('span', { className: 'lane-title', text: lane.label })
      ]),
      h('span', { className: 'lane-count', text: count + unit })
    ]);

    var children = [header];
    if (open) {
      var membersEl = h('div', { className: 'lane-members' });
      if (lane.kind === 'vehicle') {
        lane.vehicles.forEach(function (v) { membersEl.appendChild(vehicleOnlyTag(v)); });
      } else {
        lane.members.forEach(function (s) { membersEl.appendChild(buildMemberFn(s)); });
      }
      children.push(membersEl);
    }
    return h('div', { className: 'site-lane ' + laneColorClass(lane, department) }, children);
  }

  function renderDepartment(containerId, department, buildMemberFn) {
    var container = document.getElementById(containerId);
    container.innerHTML = '';
    var lanes = buildDepartmentLanes(department);
    if (!lanes.length) {
      container.appendChild(h('p', { className: 'lane-empty-msg', text: '本日の登録がありません。' }));
      return;
    }
    lanes.forEach(function (lane) {
      container.appendChild(buildLaneEl(lane, department, buildMemberFn));
    });
  }

  // ---- 個々の札(タグ) ----
  function nameTag(s, deptClass) {
    return h('button', {
      className: 'tag tag-name ' + deptClass + ' ' + (s.attendance === 'present' ? 'is-present' : 'is-absent'),
      attrs: { type: 'button' },
      onClick: function () {
        if (s.department === 'unyu') openDispatchEditMenu(s.id);
        else openDobokuMenu(s.id);
      }
    }, [h('span', { className: 'tag-name-text', html: verticalHtml(s.name) })]);
  }

  function dumpTag(s) {
    var vehId = effectiveVehicleId(s);
    var vehicle = vehId ? findVehicle(vehId) : null;
    var overrideTag = isOverridden(s) && vehId !== s.normalVehicleId ? h('span', { className: 'tag-badge', text: '本日のみ' }) : null;
    var warn = !!(vehicle && vehicle.status !== 'available');
    return h('button', {
      className: 'tag tag-info' + (vehicle ? '' : ' is-unset') + (warn ? ' is-warning' : ''),
      attrs: { type: 'button' },
      onClick: function () { openDispatchEditMenu(s.id); }
    }, [
      h('span', { className: 'tag-caption', html: verticalHtml('ダンプ') }),
      h('span', { className: 'tag-value', html: verticalHtml(vehicle ? vehicle.displayName : '未割当') }),
      warn ? h('span', { className: 'tag-badge tag-badge-warning', text: VEHICLE_STATUS_LABELS[vehicle.status] }) : null,
      overrideTag
    ]);
  }

  // 車両のみの札(空車・整備・車検・故障・使用停止の行で使う)。
  // タップすると、その車両の状態を直接変更できる。
  function vehicleOnlyTag(v) {
    var tag = h('button', {
      className: 'tag tag-info',
      attrs: { type: 'button' },
      onClick: function () { openVehicleStatusStandalone(v.id); }
    }, [
      h('span', { className: 'tag-caption', html: verticalHtml('車両') }),
      h('span', { className: 'tag-value', html: verticalHtml(v.displayName) })
    ]);
    return h('div', { className: 'tag-cluster' }, [tag]);
  }

  function buildDobokuMember(s) {
    var tags = [nameTag(s, 'dept-doboku')];
    if (effectiveVehicleId(s)) tags.push(dumpTag(s));
    return h('div', { className: 'tag-cluster' }, tags);
  }

  function buildUnyuMember(s) {
    return h('div', { className: 'tag-cluster' }, [nameTag(s, 'dept-unyu'), dumpTag(s)]);
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

  // ============================================================
  // 出勤・退勤の確定(土木メニュー・運輸配車編集メニューの両方から使う)
  // ============================================================
  // 現在と同じ状態を選んだ場合は、誤操作防止のため即記録せず確認を挟む。
  function handleAttendanceChoice(panel, staffId, close, status) {
    var s = findStaff(staffId);
    if (s.attendance === status) {
      buildAttendanceConfirmContent(panel, staffId, close, status);
    } else {
      setAttendance(staffId, status);
      close();
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
      onClick: function () { setAttendance(staffId, status); close(); }
    }));
    panel.appendChild(body);
    panel.appendChild(cancelBar(close));
  }

  function cancelBar(close) {
    return h('div', { className: 'modal-footer' }, [
      h('button', { className: 'cancel-btn', text: 'キャンセル', attrs: { type: 'button' }, onClick: close })
    ]);
  }

  // ============================================================
  // 現場選択モーダル(土木メニューの「現場を変更」/運輸配車編集メニューの
  // 「現場を変更」から遷移してくる。onBackで戻り先を切り替える)
  // ============================================================
  function buildSiteModalContent(panel, staffId, close, onBack) {
    panel.innerHTML = '';
    var s = findStaff(staffId);
    panel.appendChild(modalHeader(s.name + ' さんの現場選択', '登録済みの現場からタップで選んでください'));

    var currentSite = s.todaySiteId ? findSite(s.todaySiteId) : null;
    panel.appendChild(h('div', { className: 'current-line', text: '現在の現場：' + (currentSite ? currentSite.name : '現場未定') }));

    var body = h('div', { className: 'modal-body scroll-list' });

    var relevant = state.sites.filter(function (site) {
      return site.status === 'active' && (site.category === s.department || site.category === 'common');
    });
    relevant.sort(function (a, b) {
      var diff = (b.usageCount || 0) - (a.usageCount || 0);
      if (diff !== 0) return diff;
      return (a.order || 0) - (b.order || 0);
    });

    relevant.forEach(function (site) {
      var selected = s.todaySiteId === site.id;
      body.appendChild(h('button', {
        className: 'list-btn site-item' + (selected ? ' is-selected' : ''),
        attrs: { type: 'button' },
        onClick: function () { setStaffSite(staffId, site.id); close(); }
      }, [
        h('span', { className: 'list-btn-text', text: site.name }),
        h('span', { className: 'list-btn-tag', text: DEPT_LABELS[site.category] }),
        selected ? h('span', { className: 'current-badge', text: '選択中' }) : null
      ]));
    });

    panel.appendChild(body);

    var undecidedSelected = !s.todaySiteId;
    panel.appendChild(h('button', {
      className: 'choice-btn choice-neutral' + (undecidedSelected ? ' is-current' : ''),
      attrs: { type: 'button' },
      onClick: function () { setStaffSite(staffId, null); close(); }
    }, [
      h('span', { className: 'choice-text', text: '現場未定' }),
      undecidedSelected ? h('span', { className: 'current-badge', text: '現在' }) : null
    ]));

    panel.appendChild(h('button', {
      className: 'choice-btn choice-add',
      attrs: { type: 'button' },
      text: '＋ 新規現場を追加',
      onClick: function () {
        buildNewSiteFormCore(panel,
          function (site) { setStaffSite(staffId, site.id); close(); },
          function () { buildSiteModalContent(panel, staffId, close, onBack); });
      }
    }));

    var footer = h('div', { className: 'modal-footer two-col' });
    footer.appendChild(h('button', {
      className: 'cancel-btn',
      text: '戻る',
      attrs: { type: 'button' },
      onClick: onBack
    }));
    footer.appendChild(h('button', {
      className: 'cancel-btn',
      text: 'キャンセル',
      attrs: { type: 'button' },
      onClick: close
    }));
    panel.appendChild(footer);
  }

  // 新規現場フォームの本体部分。保存・戻る時の動作は呼び出し元が
  // onSaved(site)/onBack で指定する(人向けの現場選択・配車登録
  // ウィザードの両方から共通で使う)。
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
  // ダンプ(車両)選択モーダル
  // ============================================================
  function openVehicleModal(staffId) {
    openModal(function (panel, close) {
      buildVehicleSelectContent(panel, staffId, close, null);
    });
  }

  // onBack: nullなら単純なキャンセルのみ、指定すれば「戻る」で呼び出し元へ戻る。
  // 既に別の人が使っている車両を選んだ場合は即上書きせず、移動確認を挟む。
  function buildVehicleSelectContent(panel, staffId, close, onBack) {
    panel.innerHTML = '';
    var s = findStaff(staffId);
    panel.appendChild(modalHeader(s.name + ' さんの乗車ダンプ選択', '登録済みの車両からタップで選んでください'));

    var normalVehicle = s.normalVehicleId ? findVehicle(s.normalVehicleId) : null;
    var effId = effectiveVehicleId(s);
    var usingNormal = !isOverridden(s);

    var body = h('div', { className: 'modal-body scroll-list' });

    body.appendChild(h('button', {
      className: 'list-btn normal-item' + (usingNormal ? ' is-selected' : '') + (normalVehicle ? '' : ' is-disabled'),
      attrs: { type: 'button' },
      disabled: !normalVehicle,
      onClick: function () {
        if (!normalVehicle) return;
        selectVehicleForStaff(panel, close, staffId, null, onBack);
      }
    }, [
      h('span', { className: 'list-btn-text', text: '通常ダンプ：' + (normalVehicle ? normalVehicle.displayName : '未設定') }),
      usingNormal ? h('span', { className: 'current-badge', text: '選択中' }) : null
    ]));

    var others = sortByOrder(state.vehicles.filter(function (v) { return v.active !== false; }));
    others.forEach(function (v) {
      var usable = v.status === 'available';
      var selected = effId === v.id;
      var holder = usable ? findDriverUsingVehicle(v.id, staffId) : null;
      body.appendChild(h('button', {
        className: 'list-btn vehicle-item' + (selected ? ' is-selected' : '') + (usable ? '' : ' is-disabled'),
        attrs: { type: 'button' },
        disabled: !usable,
        onClick: function () {
          if (!usable) return;
          selectVehicleForStaff(panel, close, staffId, v.id, onBack);
        }
      }, [
        h('span', { className: 'list-btn-text', text: v.displayName }),
        !usable ? h('span', { className: 'status-badge status-' + v.status, text: VEHICLE_STATUS_LABELS[v.status] }) : null,
        (usable && holder) ? h('span', { className: 'list-btn-tag', text: holder.name + 'さん使用中' }) : null,
        selected ? h('span', { className: 'current-badge', text: '選択中' }) : null
      ]));
    });

    panel.appendChild(body);

    var unassigned = s.todayVehicleId === 'UNASSIGNED';
    panel.appendChild(h('button', {
      className: 'choice-btn choice-neutral' + (unassigned ? ' is-current' : ''),
      attrs: { type: 'button' },
      onClick: function () { setStaffVehicle(staffId, 'UNASSIGNED'); close(); }
    }, [
      h('span', { className: 'choice-text', text: '未割当' }),
      unassigned ? h('span', { className: 'current-badge', text: '現在' }) : null
    ]));

    if (onBack) {
      var footer = h('div', { className: 'modal-footer two-col' });
      footer.appendChild(h('button', { className: 'cancel-btn', text: '戻る', attrs: { type: 'button' }, onClick: onBack }));
      footer.appendChild(h('button', { className: 'cancel-btn', text: 'キャンセル', attrs: { type: 'button' }, onClick: close }));
      panel.appendChild(footer);
    } else {
      panel.appendChild(cancelBar(close));
    }
  }

  // value: null=通常ダンプへ戻す / vehicleId=指定の車両。
  // 既に他の人がその車両を使っている場合は移動確認を挟んでから確定する。
  function selectVehicleForStaff(panel, close, staffId, value, onBack) {
    if (value === null) { setStaffVehicle(staffId, null); close(); return; }
    var holder = findDriverUsingVehicle(value, staffId);
    if (!holder) { setStaffVehicle(staffId, value); close(); return; }

    var vehicle = findVehicle(value);
    var s = findStaff(staffId);
    var holderSite = holder.todaySiteId ? findSite(holder.todaySiteId) : null;
    var targetSite = s.todaySiteId ? findSite(s.todaySiteId) : null;
    panel.innerHTML = '';
    panel.appendChild(modalHeader('確認',
      vehicle.displayName + 'は現在「' + (holderSite ? holderSite.name : '現場未定') + '」の' + holder.name + 'さんが使用しています。\n' +
      '「' + (targetSite ? targetSite.name : '現場未定') + '」の' + s.name + 'さんへ付け替えますか？'));
    var body = h('div', { className: 'modal-body big-choice-list' });
    body.appendChild(h('button', {
      className: 'choice-btn choice-add', attrs: { type: 'button' }, text: '付け替える',
      onClick: function () {
        releaseVehicleFromOthers(value, staffId);
        setStaffVehicle(staffId, value);
        close();
      }
    }));
    panel.appendChild(body);
    panel.appendChild(h('div', { className: 'modal-footer' }, [
      h('button', {
        className: 'cancel-btn', text: '戻る', attrs: { type: 'button' },
        onClick: function () { buildVehicleSelectContent(panel, staffId, close, onBack); }
      })
    ]));
  }

  // ============================================================
  // 土木メニュー(名前をタップした時に表示)
  // 出勤・退勤・現場変更・休みへ移動をタップだけで選べる。
  // ============================================================
  function openDobokuMenu(staffId) {
    openModal(function (panel, close) {
      buildDobokuMenuContent(panel, staffId, close);
    });
  }

  function buildDobokuMenuContent(panel, staffId, close) {
    panel.innerHTML = '';
    var s = findStaff(staffId);
    var site = s.todaySiteId ? findSite(s.todaySiteId) : null;
    var vehId = effectiveVehicleId(s);
    var vehicle = vehId ? findVehicle(vehId) : null;
    var backHere = function () { buildDobokuMenuContent(panel, staffId, close); };
    panel.appendChild(modalHeader(s.name + ' さん', '出勤・退勤・現場の変更を選択してください'));
    panel.appendChild(h('div', {
      className: 'current-line',
      text: '現在の現場：' + (site ? site.name : '現場未定') + ' ／ ダンプ：' + (vehicle ? vehicle.displayName : '未割当') +
        (s.attendance === 'absent' ? '(休み)' : '')
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

    body.appendChild(h('button', {
      className: 'choice-btn choice-move',
      attrs: { type: 'button' },
      text: '現場を変更',
      onClick: function () { buildSiteModalContent(panel, staffId, close, backHere); }
    }));

    body.appendChild(h('button', {
      className: 'choice-btn choice-move',
      attrs: { type: 'button' },
      text: vehicle ? 'ダンプを変更' : 'ダンプを選択',
      onClick: function () { buildVehicleSelectContent(panel, staffId, close, backHere); }
    }));

    body.appendChild(h('button', {
      className: 'choice-btn choice-neutral',
      attrs: { type: 'button' },
      text: '休みへ移動',
      onClick: function () { handleAttendanceChoice(panel, staffId, close, 'absent'); }
    }));

    panel.appendChild(body);
    panel.appendChild(cancelBar(close));
  }

  // ============================================================
  // 運輸: 配車編集メニュー(名前・ダンプ札をタップした時に表示)
  // ============================================================
  function openDispatchEditMenu(staffId) {
    openModal(function (panel, close) {
      buildDispatchEditMenuContent(panel, staffId, close);
    });
  }

  function buildDispatchEditMenuContent(panel, staffId, close) {
    panel.innerHTML = '';
    var s = findStaff(staffId);
    var site = s.todaySiteId ? findSite(s.todaySiteId) : null;
    var vehId = effectiveVehicleId(s);
    var vehicle = vehId ? findVehicle(vehId) : null;
    var backHere = function () { buildDispatchEditMenuContent(panel, staffId, close); };

    panel.appendChild(modalHeader(s.name + ' さんの配車', '変更する項目を選んでください'));
    panel.appendChild(h('div', {
      className: 'current-line',
      text: '現場：' + (site ? site.name : '現場未定') + ' ／ ダンプ：' + (vehicle ? vehicle.displayName : '未割当') +
        (s.attendance === 'absent' ? ' ／ 休み' : ' ／ 出勤中')
    }));

    var body = h('div', { className: 'modal-body big-choice-list' });

    body.appendChild(h('button', {
      className: 'choice-btn choice-move', attrs: { type: 'button' }, text: '現場を変更',
      onClick: function () { buildSiteModalContent(panel, staffId, close, backHere); }
    }));
    body.appendChild(h('button', {
      className: 'choice-btn choice-move', attrs: { type: 'button' }, text: 'ダンプを変更',
      onClick: function () { buildVehicleSelectContent(panel, staffId, close, backHere); }
    }));
    body.appendChild(h('button', {
      className: 'choice-btn choice-move', attrs: { type: 'button' }, text: '運転手を変更',
      onClick: function () { buildDriverReplaceContent(panel, staffId, close, backHere); }
    }));
    body.appendChild(h('button', {
      className: 'choice-btn choice-neutral', attrs: { type: 'button' }, text: '出勤／退勤を変更',
      onClick: function () { buildAttendanceSubMenuContent(panel, staffId, close, backHere); }
    }));
    body.appendChild(h('button', {
      className: 'choice-btn choice-absent', attrs: { type: 'button' }, text: '配車を解除',
      onClick: function () { buildUnassignConfirmContent(panel, staffId, close, backHere); }
    }));

    panel.appendChild(body);
    panel.appendChild(cancelBar(close));
  }

  function buildAttendanceSubMenuContent(panel, staffId, close, onBack) {
    panel.innerHTML = '';
    var s = findStaff(staffId);
    panel.appendChild(modalHeader(s.name + ' さんの出退勤', '出勤・退勤を選択してください'));

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

    var footer = h('div', { className: 'modal-footer two-col' });
    footer.appendChild(h('button', { className: 'cancel-btn', text: '戻る', attrs: { type: 'button' }, onClick: onBack }));
    footer.appendChild(h('button', { className: 'cancel-btn', text: 'キャンセル', attrs: { type: 'button' }, onClick: close }));
    panel.appendChild(footer);
  }

  // 「運転手を変更」: 今の配車(現場・ダンプ)を別の人に引き継がせる。
  // 元の人は未配車(現場未定・ダンプ未割当)へ戻す。
  function buildDriverReplaceContent(panel, staffId, close, onBack) {
    panel.innerHTML = '';
    var s = findStaff(staffId);
    var vehId = effectiveVehicleId(s);
    var vehicle = vehId ? findVehicle(vehId) : null;
    panel.appendChild(modalHeader('運転手を変更', (vehicle ? vehicle.displayName : 'この配車') + 'を担当する人をタップしてください'));

    var body = h('div', { className: 'modal-body scroll-list' });
    var candidates = sortByOrder(state.staff.filter(function (c) {
      return c.department === 'unyu' && c.active !== false && c.id !== staffId;
    }));
    candidates.forEach(function (c) {
      var cSite = c.todaySiteId ? findSite(c.todaySiteId) : null;
      body.appendChild(h('button', {
        className: 'list-btn driver-item' + (c.attendance === 'present' ? ' is-present-driver' : ' is-absent-driver'),
        attrs: { type: 'button' },
        onClick: function () {
          if (isDriverAlreadyDispatched(c, s.todaySiteId)) {
            buildDriverReplaceConfirm(panel, staffId, close, onBack, c);
          } else {
            performDriverSwap(s, c);
            close();
          }
        }
      }, [
        h('span', { className: 'list-btn-text', text: c.name }),
        h('span', { className: 'status-badge ' + (c.attendance === 'present' ? 'status-available' : 'status-suspended'), text: c.attendance === 'present' ? '出勤' : '退勤' }),
        cSite ? h('span', { className: 'list-btn-tag', text: cSite.name }) : null
      ]));
    });
    panel.appendChild(body);

    var footer = h('div', { className: 'modal-footer two-col' });
    footer.appendChild(h('button', { className: 'cancel-btn', text: '戻る', attrs: { type: 'button' }, onClick: onBack }));
    footer.appendChild(h('button', { className: 'cancel-btn', text: 'キャンセル', attrs: { type: 'button' }, onClick: close }));
    panel.appendChild(footer);
  }

  function buildDriverReplaceConfirm(panel, staffId, close, onBack, candidate) {
    panel.innerHTML = '';
    var s = findStaff(staffId);
    var candidateSite = candidate.todaySiteId ? findSite(candidate.todaySiteId) : null;
    var targetSite = s.todaySiteId ? findSite(s.todaySiteId) : null;
    panel.appendChild(modalHeader('確認',
      candidate.name + 'さんは現在「' + (candidateSite ? candidateSite.name : '現場未定') + '」に登録されています。\n' +
      '「' + (targetSite ? targetSite.name : '現場未定') + '」へ移動しますか？'));
    var body = h('div', { className: 'modal-body big-choice-list' });
    body.appendChild(h('button', {
      className: 'choice-btn choice-add', attrs: { type: 'button' }, text: '移動する',
      onClick: function () { performDriverSwap(s, candidate); close(); }
    }));
    panel.appendChild(body);
    panel.appendChild(h('div', { className: 'modal-footer' }, [
      h('button', {
        className: 'cancel-btn', text: '戻る', attrs: { type: 'button' },
        onClick: function () { buildDriverReplaceContent(panel, staffId, close, onBack); }
      })
    ]));
  }

  function performDriverSwap(oldStaff, newStaff) {
    var siteId = oldStaff.todaySiteId;
    var vehId = effectiveVehicleId(oldStaff);

    oldStaff.todaySiteId = null;
    oldStaff.todayVehicleId = 'UNASSIGNED';

    if (vehId) releaseVehicleFromOthers(vehId, newStaff.id);
    newStaff.todaySiteId = siteId;
    newStaff.todayVehicleId = (vehId && newStaff.normalVehicleId === vehId) ? null : (vehId || 'UNASSIGNED');
    if (newStaff.attendance !== 'present') applyAttendanceChange(newStaff, 'present', new Date());

    if (siteId) { var site = findSite(siteId); if (site) site.usageCount = (site.usageCount || 0) + 1; }
    persist();
    setLaneOpen('unyu', siteId || 'UNASSIGNED', true);
    renderAll();
    showToast(newStaff.name, (siteId ? findSite(siteId).name : '現場未定') + 'の運転手を変更しました');
  }

  function buildUnassignConfirmContent(panel, staffId, close, onBack) {
    panel.innerHTML = '';
    var s = findStaff(staffId);
    panel.appendChild(modalHeader('配車を解除しますか？', s.name + 'さんの現場・ダンプの割当を解除します(出退勤の記録や人員・車両の登録自体は削除しません)。'));
    var body = h('div', { className: 'modal-body big-choice-list' });
    body.appendChild(h('button', {
      className: 'choice-btn choice-absent', attrs: { type: 'button' }, text: '解除する',
      onClick: function () { unassignDispatch(staffId); close(); }
    }));
    panel.appendChild(body);
    var footer = h('div', { className: 'modal-footer two-col' });
    footer.appendChild(h('button', { className: 'cancel-btn', text: '戻る', attrs: { type: 'button' }, onClick: onBack }));
    footer.appendChild(h('button', { className: 'cancel-btn', text: 'キャンセル', attrs: { type: 'button' }, onClick: close }));
    panel.appendChild(footer);
  }

  function unassignDispatch(staffId) {
    var s = findStaff(staffId);
    if (!s) return;
    s.todaySiteId = null;
    s.todayVehicleId = 'UNASSIGNED';
    persist();
    renderAll();
    showToast(s.name, '配車を解除しました');
  }

  // ============================================================
  // 車両管理(車検・整備・故障・使用停止)
  // ============================================================
  function openVehicleAdmin() {
    openModal(function (panel, close) {
      buildVehicleAdminContent(panel, close);
    });
  }

  // 現場ボード上の「空車・整備・車検」等の行から車両札を直接タップした
  // ときの入口。車両管理の一覧を経由せず、その車両の状態変更画面を開く。
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

  // onBack: 「戻る」で一覧へ戻りたい場合はコールバックを渡す。
  // nullの場合(現場ボードから直接開いた場合)はキャンセルのみの単純な画面にする。
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

  // ============================================================
  // 配車登録ウィザード: 現場 → ダンプ → 運転手 → 確認 の4ステップ
  // ============================================================
  var WIZARD_STEP_LABELS = ['現場', 'ダンプ', '運転手', '確認'];

  function wizardProgress(currentStep) {
    return h('div', { className: 'wizard-progress' }, WIZARD_STEP_LABELS.map(function (label, idx) {
      var stepNum = idx + 1;
      var cls = 'wizard-step' + (stepNum === currentStep ? ' is-current' : (stepNum < currentStep ? ' is-done' : ''));
      return h('div', { className: cls }, [
        h('span', { className: 'wizard-step-num', text: String(stepNum) }),
        h('span', { className: 'wizard-step-label', text: label })
      ]);
    }));
  }

  // 新規配車登録の開始(現場・ダンプ・運転手すべて未選択の状態から)
  function openDispatchWizard() {
    openModal(function (panel, close) {
      buildWizardStep1Site(panel, close, { siteId: null, vehicleId: null, personId: null });
    });
  }

  function relevantUnyuSites() {
    var sites = state.sites.filter(function (site) {
      return site.status === 'active' && (site.category === 'unyu' || site.category === 'common');
    });
    sites.sort(function (a, b) {
      var diff = (b.usageCount || 0) - (a.usageCount || 0);
      if (diff !== 0) return diff;
      return (a.order || 0) - (b.order || 0);
    });
    return sites;
  }

  // ---- ステップ1: 現場 ----
  function buildWizardStep1Site(panel, close, wizardState) {
    panel.innerHTML = '';
    panel.appendChild(wizardProgress(1));
    panel.appendChild(modalHeader('現場を選択', '配車する現場をタップしてください'));

    var body = h('div', { className: 'modal-body scroll-list' });
    relevantUnyuSites().forEach(function (site) {
      body.appendChild(h('button', {
        className: 'list-btn site-item', attrs: { type: 'button' },
        onClick: function () { wizardState.siteId = site.id; buildWizardStep2Vehicle(panel, close, wizardState); }
      }, [
        h('span', { className: 'list-btn-text', text: site.name }),
        h('span', { className: 'list-btn-tag', text: '現在' + countVehiclesAtSite(site.id) + '台' })
      ]));
    });
    body.appendChild(h('button', {
      className: 'list-btn site-item', attrs: { type: 'button' },
      onClick: function () { wizardState.siteId = null; buildWizardStep2Vehicle(panel, close, wizardState); }
    }, [h('span', { className: 'list-btn-text', text: '現場未定' })]));
    panel.appendChild(body);

    panel.appendChild(h('button', {
      className: 'choice-btn choice-add', attrs: { type: 'button' }, text: '＋ 新規現場を追加',
      onClick: function () {
        buildNewSiteFormCore(panel,
          function (site) { wizardState.siteId = site.id; buildWizardStep2Vehicle(panel, close, wizardState); },
          function () { buildWizardStep1Site(panel, close, wizardState); });
      }
    }));
    panel.appendChild(cancelBar(close));
  }

  // ---- ステップ2: ダンプ ----
  function buildWizardStep2Vehicle(panel, close, wizardState) {
    panel.innerHTML = '';
    panel.appendChild(wizardProgress(2));
    var siteLabel = wizardState.siteId ? findSite(wizardState.siteId).name : '現場未定';
    panel.appendChild(modalHeader('ダンプを選択', siteLabel + 'へ配車するダンプをタップしてください'));

    var body = h('div', { className: 'modal-body scroll-list' });
    var vehicles = sortByOrder(state.vehicles.filter(function (v) { return v.active !== false; }));
    vehicles.forEach(function (v) {
      var usable = v.status === 'available';
      var holder = usable ? findDriverUsingVehicle(v.id, null) : null;
      var normalDriver = state.staff.find(function (s) { return s.department === 'unyu' && s.active !== false && s.normalVehicleId === v.id; });
      var lines = [h('span', { className: 'list-btn-text', text: v.displayName })];
      if (!usable) lines.push(h('span', { className: 'status-badge status-' + v.status, text: VEHICLE_STATUS_LABELS[v.status] }));
      if (usable && holder) {
        var holderSite = holder.todaySiteId ? findSite(holder.todaySiteId) : null;
        lines.push(h('span', { className: 'list-btn-tag', text: holder.name + 'さん使用中(' + (holderSite ? holderSite.name : '現場未定') + ')' }));
      }
      if (usable && normalDriver) lines.push(h('span', { className: 'list-btn-tag', text: '通常運転手:' + normalDriver.name }));
      body.appendChild(h('button', {
        className: 'list-btn vehicle-item' + (usable ? '' : ' is-disabled'),
        attrs: { type: 'button' },
        disabled: !usable,
        onClick: function () {
          if (!usable) return;
          if (holder) {
            buildWizardVehicleMoveConfirm(panel, close, wizardState, v, holder);
          } else {
            wizardState.vehicleId = v.id;
            buildWizardStep3Driver(panel, close, wizardState);
          }
        }
      }, lines));
    });
    panel.appendChild(body);

    var footer = h('div', { className: 'modal-footer two-col' });
    footer.appendChild(h('button', { className: 'cancel-btn', text: '戻る', attrs: { type: 'button' }, onClick: function () { buildWizardStep1Site(panel, close, wizardState); } }));
    footer.appendChild(h('button', { className: 'cancel-btn', text: 'キャンセル', attrs: { type: 'button' }, onClick: close }));
    panel.appendChild(footer);
  }

  function buildWizardVehicleMoveConfirm(panel, close, wizardState, vehicle, holder) {
    panel.innerHTML = '';
    var holderSite = holder.todaySiteId ? findSite(holder.todaySiteId) : null;
    var targetSiteLabel = wizardState.siteId ? findSite(wizardState.siteId).name : '現場未定';
    panel.appendChild(modalHeader('確認',
      vehicle.displayName + 'は現在「' + (holderSite ? holderSite.name : '現場未定') + '」に登録されています。\n' +
      '「' + targetSiteLabel + '」へ移動しますか？'));
    var body = h('div', { className: 'modal-body big-choice-list' });
    body.appendChild(h('button', {
      className: 'choice-btn choice-add', attrs: { type: 'button' }, text: '移動する',
      onClick: function () { wizardState.vehicleId = vehicle.id; buildWizardStep3Driver(panel, close, wizardState); }
    }));
    panel.appendChild(body);
    panel.appendChild(h('div', { className: 'modal-footer' }, [
      h('button', { className: 'cancel-btn', text: '戻る', attrs: { type: 'button' }, onClick: function () { buildWizardStep2Vehicle(panel, close, wizardState); } })
    ]));
  }

  // ---- ステップ3: 運転手 ----
  function buildWizardStep3Driver(panel, close, wizardState) {
    panel.innerHTML = '';
    panel.appendChild(wizardProgress(3));
    var vehicle = findVehicle(wizardState.vehicleId);
    panel.appendChild(modalHeader('運転手を選択', vehicle.displayName + 'を運転する人をタップしてください'));

    var body = h('div', { className: 'modal-body scroll-list' });
    var allDrivers = sortByOrder(state.staff.filter(function (s) { return s.department === 'unyu' && s.active !== false; }));
    var recommended = allDrivers.filter(function (s) { return s.normalVehicleId === vehicle.id; });
    var others = allDrivers.filter(function (s) { return s.normalVehicleId !== vehicle.id; });

    function driverButton(s, tagText) {
      var dSite = s.todaySiteId ? findSite(s.todaySiteId) : null;
      return h('button', {
        className: 'list-btn driver-item' + (s.attendance === 'present' ? ' is-present-driver' : ' is-absent-driver'),
        attrs: { type: 'button' },
        onClick: function () {
          if (isDriverAlreadyDispatched(s, wizardState.siteId)) {
            buildWizardDriverMoveConfirm(panel, close, wizardState, s);
          } else {
            wizardState.personId = s.id;
            buildWizardStep4Confirm(panel, close, wizardState);
          }
        }
      }, [
        h('span', { className: 'list-btn-text', text: s.name }),
        h('span', { className: 'status-badge ' + (s.attendance === 'present' ? 'status-available' : 'status-suspended'), text: s.attendance === 'present' ? '出勤' : '退勤' }),
        tagText ? h('span', { className: 'list-btn-tag', text: tagText }) : null,
        dSite ? h('span', { className: 'list-btn-tag', text: dSite.name }) : null
      ]);
    }

    if (recommended.length) {
      body.appendChild(h('div', { className: 'records-section-title', text: 'おすすめ' }));
      recommended.forEach(function (s) { body.appendChild(driverButton(s, '通常運転手')); });
      body.appendChild(h('div', { className: 'records-section-title', text: 'その他の運転手' }));
    }
    others.forEach(function (s) { body.appendChild(driverButton(s, null)); });
    panel.appendChild(body);

    var footer = h('div', { className: 'modal-footer two-col' });
    footer.appendChild(h('button', { className: 'cancel-btn', text: '戻る', attrs: { type: 'button' }, onClick: function () { buildWizardStep2Vehicle(panel, close, wizardState); } }));
    footer.appendChild(h('button', { className: 'cancel-btn', text: 'キャンセル', attrs: { type: 'button' }, onClick: close }));
    panel.appendChild(footer);
  }

  function buildWizardDriverMoveConfirm(panel, close, wizardState, driver) {
    panel.innerHTML = '';
    var driverSite = driver.todaySiteId ? findSite(driver.todaySiteId) : null;
    var targetSiteLabel = wizardState.siteId ? findSite(wizardState.siteId).name : '現場未定';
    panel.appendChild(modalHeader('確認',
      driver.name + 'さんは現在「' + (driverSite ? driverSite.name : '現場未定') + '」に登録されています。\n' +
      '「' + targetSiteLabel + '」へ移動しますか？'));
    var body = h('div', { className: 'modal-body big-choice-list' });
    body.appendChild(h('button', {
      className: 'choice-btn choice-add', attrs: { type: 'button' }, text: '移動する',
      onClick: function () { wizardState.personId = driver.id; buildWizardStep4Confirm(panel, close, wizardState); }
    }));
    panel.appendChild(body);
    panel.appendChild(h('div', { className: 'modal-footer' }, [
      h('button', { className: 'cancel-btn', text: '戻る', attrs: { type: 'button' }, onClick: function () { buildWizardStep3Driver(panel, close, wizardState); } })
    ]));
  }

  // ---- ステップ4: 確認・登録 ----
  function buildWizardStep4Confirm(panel, close, wizardState) {
    panel.innerHTML = '';
    panel.appendChild(wizardProgress(4));
    var site = wizardState.siteId ? findSite(wizardState.siteId) : null;
    var vehicle = findVehicle(wizardState.vehicleId);
    var driver = findStaff(wizardState.personId);
    panel.appendChild(modalHeader('配車内容を確認してください', ''));

    var body = h('div', { className: 'modal-body' });
    body.appendChild(h('div', { className: 'confirm-row' }, [h('span', { className: 'confirm-label', text: '現場' }), h('span', { className: 'confirm-value', text: site ? site.name : '現場未定' })]));
    body.appendChild(h('div', { className: 'confirm-row' }, [h('span', { className: 'confirm-label', text: 'ダンプ' }), h('span', { className: 'confirm-value', text: vehicle.displayName })]));
    body.appendChild(h('div', { className: 'confirm-row' }, [h('span', { className: 'confirm-label', text: '運転手' }), h('span', { className: 'confirm-value', text: driver.name })]));
    panel.appendChild(body);

    panel.appendChild(h('button', {
      className: 'choice-btn choice-add', attrs: { type: 'button' }, text: 'この内容で登録',
      onClick: function () { commitDispatch(wizardState); buildWizardAfterRegister(panel, close, wizardState); }
    }));

    var footer = h('div', { className: 'modal-footer two-col' });
    footer.appendChild(h('button', { className: 'cancel-btn', text: '戻る', attrs: { type: 'button' }, onClick: function () { buildWizardStep3Driver(panel, close, wizardState); } }));
    footer.appendChild(h('button', { className: 'cancel-btn', text: 'キャンセル', attrs: { type: 'button' }, onClick: close }));
    panel.appendChild(footer);
  }

  function commitDispatch(wizardState) {
    var driver = findStaff(wizardState.personId);
    var vehicle = findVehicle(wizardState.vehicleId);

    releaseVehicleFromOthers(vehicle.id, driver.id);
    driver.todaySiteId = wizardState.siteId;
    driver.todayVehicleId = (driver.normalVehicleId === vehicle.id) ? null : vehicle.id;
    if (driver.attendance !== 'present') applyAttendanceChange(driver, 'present', new Date());
    if (wizardState.siteId) {
      var site = findSite(wizardState.siteId);
      if (site) site.usageCount = (site.usageCount || 0) + 1;
    }
    persist();
    setLaneOpen('unyu', wizardState.siteId || 'UNASSIGNED', true);
    renderAll();
    showToast((wizardState.siteId ? findSite(wizardState.siteId).name : '現場未定') + 'へ', driver.name + '・' + vehicle.displayName + 'を登録しました');
  }

  function buildWizardAfterRegister(panel, close, wizardState) {
    panel.innerHTML = '';
    panel.appendChild(modalHeader('登録しました', '続けて登録しますか？'));
    var body = h('div', { className: 'modal-body big-choice-list' });
    body.appendChild(h('button', {
      className: 'choice-btn choice-add', attrs: { type: 'button' }, text: '同じ現場にもう1台追加',
      onClick: function () {
        wizardState.vehicleId = null;
        wizardState.personId = null;
        buildWizardStep2Vehicle(panel, close, wizardState);
      }
    }));
    body.appendChild(h('button', {
      className: 'choice-btn choice-neutral', attrs: { type: 'button' }, text: '配車ボードへ戻る',
      onClick: close
    }));
    panel.appendChild(body);
  }

  // ============================================================
  // 出退勤記録: イベントログの集計とCSV出力(日次・月次)
  // ============================================================
  var CSV_HEADERS = ['日付', '所属', '氏名', '出勤時刻', '退勤時刻', '勤務時間'];
  var DEPT_ORDER_BY_LABEL = { '土木': 1, '運輸': 2, '共通': 3 };
  function deptRank(label) { return DEPT_ORDER_BY_LABEL[label] || 9; }

  function csvEscape(v) {
    v = (v == null) ? '' : String(v);
    if (/[",\r\n]/.test(v)) v = '"' + v.replace(/"/g, '""') + '"';
    return v;
  }

  // 同じ人・同じ日のイベント群から、最初のclockInと最後のclockOutを求める。
  // イベント自体は一切変更・削除しない(集計はあくまで読み取り専用の計算)。
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

  // 出勤・退勤の両方がある場合だけ勤務時間を算出する。
  // 退勤が出勤より前(打刻ミス等)の場合は算出せず「要確認」と表示する。
  function summarizeRow(row) {
    var clockInStr = row.clockInIso ? formatTimeHM(row.clockInIso) : '';
    var clockOutStr = row.clockOutIso ? formatTimeHM(row.clockOutIso) : '';
    var duration = '';
    if (row.clockInIso && row.clockOutIso) {
      var startMs = new Date(row.clockInIso).getTime();
      var endMs = new Date(row.clockOutIso).getTime();
      duration = endMs < startMs ? '要確認' : formatDurationHM(row.clockInIso, row.clockOutIso);
    }
    return { clockInStr: clockInStr, clockOutStr: clockOutStr, duration: duration };
  }

  function buildCsv(rows) {
    var lines = [CSV_HEADERS.map(csvEscape).join(',')];
    rows.forEach(function (row) {
      var sum = summarizeRow(row);
      lines.push([row.date, row.department, row.personName, sum.clockInStr, sum.clockOutStr, sum.duration].map(csvEscape).join(','));
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

  function openRecordsModal() {
    openModal(function (panel, close) {
      var today = new Date();
      buildRecordsContent(panel, close, today, { year: today.getFullYear(), month: today.getMonth() + 1 }, 'summary');
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

  function buildRecordsContent(panel, close, dailyDate, monthYm, dailyView) {
    panel.innerHTML = '';
    panel.appendChild(modalHeader('出退勤記録', '日付・月を選んでCSV(Excelで開けます)をダウンロード、または操作履歴を確認できます'));

    var body = h('div', { className: 'modal-body scroll-list' });
    var statusMsg = h('p', { className: 'download-status' });

    // ---- 日次 ----
    body.appendChild(h('div', { className: 'records-section-title', text: '日次(1日分)' }));
    var dailyNav = h('div', { className: 'date-nav-row' }, [
      h('button', {
        className: 'date-nav-btn', text: '◀ 前日', attrs: { type: 'button' },
        onClick: function () { buildRecordsContent(panel, close, shiftDate(dailyDate, -1), monthYm, dailyView); }
      }),
      h('div', { className: 'date-display', text: formatDateJP(dailyDate) }),
      h('button', {
        className: 'date-nav-btn', text: '翌日 ▶', attrs: { type: 'button' },
        onClick: function () { buildRecordsContent(panel, close, shiftDate(dailyDate, 1), monthYm, dailyView); }
      })
    ]);
    body.appendChild(dailyNav);

    var dateStr = formatYMD(dailyDate);

    var tabRow = h('div', { className: 'tab-row' }, [
      h('button', {
        className: 'tab-btn' + (dailyView === 'summary' ? ' is-active' : ''),
        attrs: { type: 'button' }, text: '日次集計',
        onClick: function () { buildRecordsContent(panel, close, dailyDate, monthYm, 'summary'); }
      }),
      h('button', {
        className: 'tab-btn' + (dailyView === 'history' ? ' is-active' : ''),
        attrs: { type: 'button' }, text: '操作履歴',
        onClick: function () { buildRecordsContent(panel, close, dailyDate, monthYm, 'history'); }
      })
    ]);
    body.appendChild(tabRow);

    if (dailyView === 'history') {
      var events = state.attendanceLogs.filter(function (r) { return r.date === dateStr; })
        .slice().sort(function (a, b) { return a.timestamp < b.timestamp ? -1 : (a.timestamp > b.timestamp ? 1 : 0); });
      if (!events.length) {
        body.appendChild(h('p', { className: 'record-empty', text: 'この日の操作履歴はありません。' }));
      } else {
        events.forEach(function (e) {
          body.appendChild(h('div', { className: 'history-row' }, [
            h('span', { className: 'history-time', text: formatTimeHM(e.timestamp) }),
            h('span', { className: 'history-name', text: e.personName }),
            h('span', { className: 'history-action history-action-' + e.action, text: e.action === 'clockIn' ? '出勤' : '退勤' })
          ]));
        });
      }
    } else {
      var summaryRows = buildDailyAggregatedRows(dateStr);
      if (!summaryRows.length) {
        body.appendChild(h('p', { className: 'record-empty', text: 'この日の記録はまだありません。' }));
      } else {
        body.appendChild(h('div', { className: 'record-row record-row-header' }, [
          h('span', { className: 'record-col record-col-name', text: '氏名' }),
          h('span', { className: 'record-col record-col-dept', text: '所属' }),
          h('span', { className: 'record-col record-col-time', text: '出勤' }),
          h('span', { className: 'record-col record-col-time', text: '退勤' }),
          h('span', { className: 'record-col record-col-dur', text: '勤務時間' })
        ]));
        summaryRows.forEach(function (row) {
          var sum = summarizeRow(row);
          body.appendChild(h('div', { className: 'record-row' }, [
            h('span', { className: 'record-col record-col-name', text: row.personName }),
            h('span', { className: 'record-col record-col-dept', text: row.department }),
            h('span', { className: 'record-col record-col-time', text: sum.clockInStr }),
            h('span', { className: 'record-col record-col-time', text: sum.clockOutStr }),
            h('span', { className: 'record-col record-col-dur' + (sum.duration === '要確認' ? ' is-warning' : ''), text: sum.duration })
          ]));
        });
      }
    }

    body.appendChild(h('button', {
      className: 'choice-btn choice-download',
      attrs: { type: 'button' },
      text: 'この日の記録をCSVダウンロード',
      onClick: function () {
        var rows = buildDailyAggregatedRows(dateStr);
        downloadCsv('attendance_' + dateStr + '.csv', buildCsv(rows));
        statusMsg.textContent = rows.length ? '✔ ' + dateStr + ' の記録(' + rows.length + '人分)をダウンロードしました。' : '※ この日の記録はまだありません(0件で出力しました)。';
      }
    }));

    // ---- 月次 ----
    body.appendChild(h('div', { className: 'records-section-title', text: '月次(1か月分)' }));
    var monthNav = h('div', { className: 'date-nav-row' }, [
      h('button', {
        className: 'date-nav-btn', text: '◀ 前月', attrs: { type: 'button' },
        onClick: function () { buildRecordsContent(panel, close, dailyDate, shiftMonth(monthYm, -1), dailyView); }
      }),
      h('div', { className: 'date-display', text: monthYm.year + '年' + monthYm.month + '月' }),
      h('button', {
        className: 'date-nav-btn', text: '翌月 ▶', attrs: { type: 'button' },
        onClick: function () { buildRecordsContent(panel, close, dailyDate, shiftMonth(monthYm, 1), dailyView); }
      })
    ]);
    body.appendChild(monthNav);
    body.appendChild(h('button', {
      className: 'choice-btn choice-download',
      attrs: { type: 'button' },
      text: 'この月の記録をCSVダウンロード',
      onClick: function () {
        var rows = buildMonthlyAggregatedRows(monthYm.year, monthYm.month);
        var label = monthYm.year + '-' + pad2(monthYm.month);
        downloadCsv('attendance_' + label + '.csv', buildCsv(rows));
        statusMsg.textContent = rows.length ? '✔ ' + monthYm.year + '年' + monthYm.month + '月 の記録(' + rows.length + '件)をダウンロードしました。' : '※ この月の記録はまだありません(0件で出力しました)。';
      }
    }));

    body.appendChild(statusMsg);

    panel.appendChild(body);
    panel.appendChild(cancelBar(close));
  }

  document.addEventListener('DOMContentLoaded', init);
})();
