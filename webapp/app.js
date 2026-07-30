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
  // 出勤・退勤の確定処理。
  // 1.対象者を特定 → 2.状態を更新 → 3.現在日時を取得 →
  // 4.イベントログへ追加(過去のイベントは上書きしない) → 5.保存 →
  // 6.画面へ反映 → 7.記録完了メッセージを表示、の順で行う。
  function setAttendance(staffId, status) {
    var s = findStaff(staffId);
    if (!s) return;
    s.attendance = status;

    var now = new Date();
    var timestamp = toLocalISOString(now);
    var action = status === 'present' ? 'clockIn' : 'clockOut';
    state.attendanceLogs.push({
      id: genId('log'),
      personId: s.id,
      personName: s.name,
      department: DEPT_LABELS[s.department] || s.department,
      action: action,
      timestamp: timestamp,
      date: formatYMD(now),
      createdAt: timestamp
    });

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
  // メイン画面描画
  // ============================================================
  function renderAll() {
    renderDobokuList();
    renderUnyuList();
  }

  // 同じ現場の人を隣り合わせに並べる(現場タグは今まで通り人ごとに独立)。
  // 「一つの現場に何台も配置されている」ことが一目でわかるよう、
  // 同じ現場のタグは見た目上すき間なく連結して表示する。
  // 現場未定の人は最後のグループにまとめる。
  function groupStaffBySite(list) {
    var groups = {};
    list.forEach(function (s) {
      var key = s.todaySiteId || 'UNASSIGNED';
      (groups[key] = groups[key] || []).push(s);
    });
    var keys = Object.keys(groups);
    keys.sort(function (a, b) {
      if (a === 'UNASSIGNED') return 1;
      if (b === 'UNASSIGNED') return -1;
      var siteA = findSite(a), siteB = findSite(b);
      return ((siteA && siteA.order) || 0) - ((siteB && siteB.order) || 0);
    });
    return keys.map(function (key) { return sortByOrder(groups[key]); });
  }

  function renderTagShelf(containerId, list, buildClusterFn) {
    var container = document.getElementById(containerId);
    container.innerHTML = '';
    groupStaffBySite(list).forEach(function (members) {
      var groupEl = h('div', { className: 'site-group' });
      members.forEach(function (s) { groupEl.appendChild(buildClusterFn(s)); });
      container.appendChild(groupEl);
    });
  }

  function renderDobokuList() {
    var list = state.staff.filter(function (s) { return s.department === 'doboku' && s.active !== false; });
    renderTagShelf('doboku-list', list, buildDobokuTagCluster);
  }

  function nameTag(s, deptClass) {
    return h('button', {
      className: 'tag tag-name ' + deptClass + ' ' + (s.attendance === 'present' ? 'is-present' : 'is-absent'),
      attrs: { type: 'button' },
      onClick: function () { openAttendanceModal(s.id); }
    }, [h('span', { className: 'tag-name-text', html: verticalHtml(s.name) })]);
  }

  function siteTag(s) {
    var site = s.todaySiteId ? findSite(s.todaySiteId) : null;
    return h('button', {
      className: 'tag tag-info' + (site ? '' : ' is-unset'),
      attrs: { type: 'button' },
      onClick: function () { openSiteModal(s.id); }
    }, [
      h('span', { className: 'tag-caption', html: verticalHtml('現場') }),
      h('span', { className: 'tag-value', html: verticalHtml(site ? site.name : '現場未定') })
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
      h('span', { className: 'tag-caption', html: verticalHtml('ダンプ') }),
      h('span', { className: 'tag-value', html: verticalHtml(vehicle ? vehicle.displayName : '未割当') }),
      overrideTag
    ]);
  }

  function buildDobokuTagCluster(s) {
    return h('div', { className: 'tag-cluster' }, [nameTag(s, 'dept-doboku'), siteTag(s)]);
  }

  function renderUnyuList() {
    var list = state.staff.filter(function (s) { return s.department === 'unyu' && s.active !== false; });
    renderTagShelf('unyu-list', list, buildUnyuTagCluster);
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
      buildAttendanceChoiceContent(panel, staffId, close);
    });
  }

  function buildAttendanceChoiceContent(panel, staffId, close) {
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
