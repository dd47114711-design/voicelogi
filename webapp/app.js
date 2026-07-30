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
    return loaded;
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
  function setAttendance(staffId, status) {
    var s = findStaff(staffId);
    if (!s) return;
    s.attendance = status;
    recordAttendanceEvent(s, status === 'present' ? 'in' : 'out');
    persist();
    renderAll();
  }

  // その日の出勤・退勤時刻を記録する(CSV出力用)。
  // 同じ人・同じ日のタップは上書きし、最後にタップした時刻を採用する。
  function recordAttendanceEvent(staff, type) {
    var now = new Date();
    var dateStr = formatYMD(now);
    var rec = state.attendanceLogs.find(function (r) { return r.staffId === staff.id && r.date === dateStr; });
    if (!rec) {
      rec = { id: genId('log'), date: dateStr, staffId: staff.id, staffName: staff.name, department: staff.department, clockIn: null, clockOut: null };
      state.attendanceLogs.push(rec);
    }
    rec.staffName = staff.name;
    rec.department = staff.department;
    if (type === 'in') rec.clockIn = now.toISOString();
    if (type === 'out') rec.clockOut = now.toISOString();
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
  // メイン画面描画
  // ============================================================
  function renderAll() {
    renderDobokuList();
    renderUnyuList();
  }

  function renderDobokuList() {
    var container = document.getElementById('doboku-list');
    container.innerHTML = '';
    var list = sortByOrder(state.staff.filter(function (s) { return s.department === 'doboku' && s.active !== false; }));
    list.forEach(function (s) {
      container.appendChild(buildDobokuTagCluster(s));
    });
  }

  function nameTag(s, deptClass) {
    return h('button', {
      className: 'tag tag-name ' + deptClass + ' ' + (s.attendance === 'present' ? 'is-present' : 'is-absent'),
      attrs: { type: 'button' },
      onClick: function () { openAttendanceModal(s.id); }
    }, [h('span', { className: 'tag-name-text', text: s.name })]);
  }

  function siteTag(s) {
    var site = s.todaySiteId ? findSite(s.todaySiteId) : null;
    return h('button', {
      className: 'tag tag-info' + (site ? '' : ' is-unset'),
      attrs: { type: 'button' },
      onClick: function () { openSiteModal(s.id); }
    }, [
      h('span', { className: 'tag-caption', text: '現場' }),
      h('span', { className: 'tag-value', text: site ? site.name : '現場未定' })
    ]);
  }

  function dumpTag(s) {
    var vehId = effectiveVehicleId(s);
    var vehicle = vehId ? findVehicle(vehId) : null;
    var overrideTag = isOverridden(s) && vehId !== s.normalVehicleId ? h('span', { className: 'tag-badge', text: '本日のみ' }) : null;
    return h('button', {
      className: 'tag tag-info' + (vehicle ? '' : ' is-unset'),
      attrs: { type: 'button' },
      onClick: function () { openVehicleModal(s.id); }
    }, [
      h('span', { className: 'tag-caption', text: 'ダンプ' }),
      h('span', { className: 'tag-value', text: vehicle ? vehicle.displayName : '未割当' }),
      overrideTag
    ]);
  }

  function buildDobokuTagCluster(s) {
    return h('div', { className: 'tag-cluster' }, [nameTag(s, 'dept-doboku'), siteTag(s)]);
  }

  function renderUnyuList() {
    var container = document.getElementById('unyu-list');
    container.innerHTML = '';
    var list = sortByOrder(state.staff.filter(function (s) { return s.department === 'unyu' && s.active !== false; }));
    list.forEach(function (s) {
      container.appendChild(buildUnyuTagCluster(s));
    });
  }

  function buildUnyuTagCluster(s) {
    return h('div', { className: 'tag-cluster' }, [nameTag(s, 'dept-unyu'), siteTag(s), dumpTag(s)]);
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
  // 出勤・退勤モーダル
  // ============================================================
  function openAttendanceModal(staffId) {
    openModal(function (panel, close) {
      var s = findStaff(staffId);
      panel.appendChild(modalHeader(s.name + ' さん', '出勤・退勤を選択してください'));

      var body = h('div', { className: 'modal-body big-choice-list' });

      body.appendChild(h('button', {
        className: 'choice-btn choice-present' + (s.attendance === 'present' ? ' is-current' : ''),
        attrs: { type: 'button' },
        onClick: function () { setAttendance(staffId, 'present'); close(); }
      }, [
        h('span', { className: 'choice-text', text: '出勤' }),
        s.attendance === 'present' ? h('span', { className: 'current-badge', text: '現在' }) : null
      ]));

      body.appendChild(h('button', {
        className: 'choice-btn choice-absent' + (s.attendance === 'absent' ? ' is-current' : ''),
        attrs: { type: 'button' },
        onClick: function () { setAttendance(staffId, 'absent'); close(); }
      }, [
        h('span', { className: 'choice-text', text: '退勤' }),
        s.attendance === 'absent' ? h('span', { className: 'current-badge', text: '現在' }) : null
      ]));

      panel.appendChild(body);
      panel.appendChild(cancelBar(close));
    });
  }

  function cancelBar(close) {
    return h('div', { className: 'modal-footer' }, [
      h('button', { className: 'cancel-btn', text: 'キャンセル', attrs: { type: 'button' }, onClick: close })
    ]);
  }

  // ============================================================
  // 現場選択モーダル
  // ============================================================
  function openSiteModal(staffId) {
    openModal(function (panel, close) {
      buildSiteModalContent(panel, staffId, close);
    });
  }

  function buildSiteModalContent(panel, staffId, close) {
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
      onClick: function () { buildNewSiteFormContent(panel, staffId, close); }
    }));

    panel.appendChild(cancelBar(close));
  }

  function buildNewSiteFormContent(panel, staffId, close) {
    panel.innerHTML = '';
    panel.appendChild(modalHeader('新規現場を追加', '現場名を入力し、区分を選んでください'));

    var body = h('div', { className: 'modal-body' });

    var errorMsg = h('p', { className: 'form-error hidden' });

    var label = h('label', { className: 'form-label', text: '現場名' });
    var input = h('input', {
      className: 'form-input',
      attrs: { type: 'text', inputmode: 'text', autocomplete: 'off', placeholder: '例：〇〇土木現場' }
    });

    body.appendChild(label);
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
    var backBtn = h('button', {
      className: 'cancel-btn',
      text: '戻る',
      attrs: { type: 'button' },
      onClick: function () { buildSiteModalContent(panel, staffId, close); }
    });
    var saveBtn = h('button', {
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
        setStaffSite(staffId, result.site.id);
        close();
      }
    });
    footer.appendChild(backBtn);
    footer.appendChild(saveBtn);
    panel.appendChild(footer);

    input.focus();
  }

  // ============================================================
  // ダンプ(車両)選択モーダル
  // ============================================================
  function openVehicleModal(staffId) {
    openModal(function (panel, close) {
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
          setStaffVehicle(staffId, null);
          close();
        }
      }, [
        h('span', { className: 'list-btn-text', text: '通常ダンプ：' + (normalVehicle ? normalVehicle.displayName : '未設定') }),
        usingNormal ? h('span', { className: 'current-badge', text: '選択中' }) : null
      ]));

      var others = sortByOrder(state.vehicles.filter(function (v) { return v.active !== false; }));
      others.forEach(function (v) {
        var usable = v.status === 'available';
        var selected = effId === v.id;
        body.appendChild(h('button', {
          className: 'list-btn vehicle-item' + (selected ? ' is-selected' : '') + (usable ? '' : ' is-disabled'),
          attrs: { type: 'button' },
          disabled: !usable,
          onClick: function () {
            if (!usable) return;
            setStaffVehicle(staffId, v.id);
            close();
          }
        }, [
          h('span', { className: 'list-btn-text', text: v.displayName }),
          !usable ? h('span', { className: 'status-badge status-' + v.status, text: VEHICLE_STATUS_LABELS[v.status] }) : null,
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

      panel.appendChild(cancelBar(close));
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

  function buildVehicleAdminContent(panel, close) {
    panel.innerHTML = '';
    panel.appendChild(modalHeader('車両管理', '車両をタップして状態を変更してください'));

    var body = h('div', { className: 'modal-body scroll-list' });
    var list = sortByOrder(state.vehicles.filter(function (v) { return v.active !== false; }));
    list.forEach(function (v) {
      body.appendChild(h('button', {
        className: 'list-btn vehicle-admin-item',
        attrs: { type: 'button' },
        onClick: function () { buildVehicleStatusContent(panel, v.id, close); }
      }, [
        h('span', { className: 'list-btn-text', text: v.displayName }),
        h('span', { className: 'status-badge status-' + v.status, text: VEHICLE_STATUS_LABELS[v.status] })
      ]));
    });
    panel.appendChild(body);
    panel.appendChild(cancelBar(close));
  }

  function buildVehicleStatusContent(panel, vehicleId, close) {
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
          buildVehicleAdminContent(panel, close);
        }
      }, [
        h('span', { className: 'choice-text', text: VEHICLE_STATUS_LABELS[statusKey] }),
        current ? h('span', { className: 'current-badge', text: '現在' }) : null
      ]));
    });
    panel.appendChild(body);

    var footer = h('div', { className: 'modal-footer two-col' });
    footer.appendChild(h('button', {
      className: 'cancel-btn',
      text: '戻る',
      attrs: { type: 'button' },
      onClick: function () { buildVehicleAdminContent(panel, close); }
    }));
    footer.appendChild(h('button', {
      className: 'cancel-btn',
      text: 'キャンセル',
      attrs: { type: 'button' },
      onClick: close
    }));
    panel.appendChild(footer);
  }

  // ============================================================
  // 出退勤記録のCSV出力(日次・月次)
  // ============================================================
  var CSV_HEADERS = ['日付', '所属', '氏名', '出勤時刻', '退勤時刻', '勤務時間'];

  function csvEscape(v) {
    v = (v == null) ? '' : String(v);
    if (/[",\r\n]/.test(v)) v = '"' + v.replace(/"/g, '""') + '"';
    return v;
  }

  function buildCsv(records) {
    var lines = [CSV_HEADERS.map(csvEscape).join(',')];
    records.forEach(function (r) {
      lines.push([
        r.date,
        DEPT_LABELS[r.department] || r.department,
        r.staffName,
        formatTimeHM(r.clockIn),
        formatTimeHM(r.clockOut),
        formatDurationHM(r.clockIn, r.clockOut)
      ].map(csvEscape).join(','));
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

  function getDailyRecords(dateStr) {
    var list = state.attendanceLogs.filter(function (r) { return r.date === dateStr && (r.clockIn || r.clockOut); });
    return sortRecordsForExport(list);
  }

  function getMonthlyRecords(year, month) {
    var prefix = year + '-' + pad2(month) + '-';
    var list = state.attendanceLogs.filter(function (r) { return r.date.indexOf(prefix) === 0 && (r.clockIn || r.clockOut); });
    return sortRecordsForExport(list);
  }

  function sortRecordsForExport(list) {
    return list.slice().sort(function (a, b) {
      if (a.date !== b.date) return a.date < b.date ? -1 : 1;
      if (a.department !== b.department) return a.department < b.department ? -1 : 1;
      var sa = findStaff(a.staffId), sb = findStaff(b.staffId);
      return ((sa && sa.order) || 0) - ((sb && sb.order) || 0);
    });
  }

  function openRecordsModal() {
    openModal(function (panel, close) {
      var today = new Date();
      buildRecordsContent(panel, close, today, { year: today.getFullYear(), month: today.getMonth() + 1 });
    });
  }

  function shiftDate(d, days) {
    var next = new Date(d.getFullYear(), d.getMonth(), d.getDate() + days);
    return next;
  }

  function shiftMonth(ym, delta) {
    var total = ym.year * 12 + (ym.month - 1) + delta;
    var year = Math.floor(total / 12);
    var month = (total % 12) + 1;
    return { year: year, month: month };
  }

  function buildRecordsContent(panel, close, dailyDate, monthYm) {
    panel.innerHTML = '';
    panel.appendChild(modalHeader('出退勤記録のダウンロード', '日付・月を選んでCSV(Excelで開けます)をダウンロードします'));

    var body = h('div', { className: 'modal-body' });
    var statusMsg = h('p', { className: 'download-status' });

    // ---- 日次 ----
    body.appendChild(h('div', { className: 'records-section-title', text: '日次(1日分)' }));
    var dailyNav = h('div', { className: 'date-nav-row' }, [
      h('button', {
        className: 'date-nav-btn', text: '◀ 前日', attrs: { type: 'button' },
        onClick: function () { buildRecordsContent(panel, close, shiftDate(dailyDate, -1), monthYm); }
      }),
      h('div', { className: 'date-display', text: formatDateJP(dailyDate) }),
      h('button', {
        className: 'date-nav-btn', text: '翌日 ▶', attrs: { type: 'button' },
        onClick: function () { buildRecordsContent(panel, close, shiftDate(dailyDate, 1), monthYm); }
      })
    ]);
    body.appendChild(dailyNav);
    body.appendChild(h('button', {
      className: 'choice-btn choice-download',
      attrs: { type: 'button' },
      text: 'この日の記録をCSVダウンロード',
      onClick: function () {
        var dateStr = formatYMD(dailyDate);
        var records = getDailyRecords(dateStr);
        downloadCsv('attendance_' + dateStr + '.csv', buildCsv(records));
        statusMsg.textContent = records.length ? '✔ ' + dateStr + ' の記録(' + records.length + '件)をダウンロードしました。' : '※ この日の記録はまだありません(0件で出力しました)。';
      }
    }));

    // ---- 月次 ----
    body.appendChild(h('div', { className: 'records-section-title', text: '月次(1か月分)' }));
    var monthNav = h('div', { className: 'date-nav-row' }, [
      h('button', {
        className: 'date-nav-btn', text: '◀ 前月', attrs: { type: 'button' },
        onClick: function () { buildRecordsContent(panel, close, dailyDate, shiftMonth(monthYm, -1)); }
      }),
      h('div', { className: 'date-display', text: monthYm.year + '年' + monthYm.month + '月' }),
      h('button', {
        className: 'date-nav-btn', text: '翌月 ▶', attrs: { type: 'button' },
        onClick: function () { buildRecordsContent(panel, close, dailyDate, shiftMonth(monthYm, 1)); }
      })
    ]);
    body.appendChild(monthNav);
    body.appendChild(h('button', {
      className: 'choice-btn choice-download',
      attrs: { type: 'button' },
      text: 'この月の記録をCSVダウンロード',
      onClick: function () {
        var records = getMonthlyRecords(monthYm.year, monthYm.month);
        var label = monthYm.year + '-' + pad2(monthYm.month);
        downloadCsv('attendance_' + label + '.csv', buildCsv(records));
        statusMsg.textContent = records.length ? '✔ ' + monthYm.year + '年' + monthYm.month + '月 の記録(' + records.length + '件)をダウンロードしました。' : '※ この月の記録はまだありません(0件で出力しました)。';
      }
    }));

    body.appendChild(statusMsg);

    panel.appendChild(body);
    panel.appendChild(cancelBar(close));
  }

  document.addEventListener('DOMContentLoaded', init);
})();
