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

    updateClock();
    setInterval(updateClock, 10000);

    renderAll();
  }

  function loadOrInitState() {
    var loaded = Storage.loadState();
    if (!loaded || !loaded.staff || !loaded.sites || !loaded.vehicles) {
      var fresh = createSeedState();
      Storage.saveState(fresh);
      return fresh;
    }
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

  function updateClock() {
    var now = new Date();
    var days = ['日', '月', '火', '水', '木', '金', '土'];
    var text = now.getFullYear() + '年' + (now.getMonth() + 1) + '月' + now.getDate() + '日(' +
      days[now.getDay()] + ') ' + pad2(now.getHours()) + ':' + pad2(now.getMinutes());
    var clockEl = document.getElementById('clock');
    if (clockEl) clockEl.textContent = text;
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
    persist();
    renderAll();
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

  document.addEventListener('DOMContentLoaded', init);
})();
