// 音声配車入力: 文字起こしテキストの解析結果(下書き)を表示し、未確定項目は
// プルダウンで手動選択できるようにしてから登録する。
(function () {
  "use strict";
  var CONF = window.VOICE_CONF;
  var draft = null;

  function el(tag, attrs, text) {
    var e = document.createElement(tag);
    if (attrs) {
      Object.keys(attrs).forEach(function (k) { e.setAttribute(k, attrs[k]); });
    }
    if (text !== undefined) e.textContent = text;
    return e;
  }

  function buildSelect(options, selectedId, testAttr) {
    var select = document.createElement("select");
    if (testAttr) select.setAttribute("data-role", testAttr);
    select.appendChild(el("option", { value: "" }, "-- 未選択 --"));
    options.forEach(function (opt) {
      var label = opt.name || opt.plate_no;
      var o = el("option", { value: opt.id }, label);
      if (selectedId && String(opt.id) === String(selectedId)) {
        o.selected = true;
      }
      select.appendChild(o);
    });
    return select;
  }

  function renderWarnings(warnings) {
    var box = document.getElementById("draft-warnings");
    box.innerHTML = "";
    if (!warnings || !warnings.length) return;
    var ul = document.createElement("ul");
    ul.className = "needs-review";
    warnings.forEach(function (w) { ul.appendChild(el("li", null, w)); });
    box.appendChild(ul);
  }

  function renderClientSite() {
    var clientCell = document.getElementById("draft-client");
    clientCell.innerHTML = "";
    var clientSelect = buildSelect(CONF.masters.clients, draft.client.matched ? draft.client.id : null, "client");
    clientCell.appendChild(clientSelect);
    if (draft.client.raw_text) {
      clientCell.appendChild(el("span", { class: "note" }, "  (聞き取り: " + draft.client.raw_text + ")"));
    }

    var siteCell = document.getElementById("draft-site");
    siteCell.innerHTML = "";
    var siteSelect = buildSelect(filterSitesByClient(clientSelect.value), draft.site.matched ? draft.site.id : null, "site");
    siteCell.appendChild(siteSelect);
    if (draft.site.raw_text) {
      siteCell.appendChild(el("span", { class: "note" }, "  (聞き取り: " + draft.site.raw_text + ")"));
    }

    clientSelect.addEventListener("change", function () {
      var newSiteSelect = buildSelect(filterSitesByClient(clientSelect.value), null, "site");
      siteCell.innerHTML = "";
      siteCell.appendChild(newSiteSelect);
    });
  }

  function filterSitesByClient(clientId) {
    if (!clientId) return CONF.masters.sites.filter(function (s) { return !s.client_id; });
    return CONF.masters.sites.filter(function (s) { return String(s.client_id) === String(clientId); });
  }

  function renderOwnVehicles() {
    var tbody = document.getElementById("draft-own-vehicles");
    tbody.innerHTML = "";
    draft.own_vehicles.forEach(function (v) {
      var tr = document.createElement("tr");
      tr.appendChild(el("td", null, "聞き取り: " + v.raw_text));
      var td = document.createElement("td");
      td.appendChild(buildSelect(CONF.masters.vehicles, v.matched ? v.id : null, "own_vehicle"));
      tr.appendChild(td);
      tbody.appendChild(tr);
    });
    if (!draft.own_vehicles.length) {
      tbody.appendChild(el("tr", null, null)).appendChild(el("td", { colspan: "2" }, "自社車両は抽出されませんでした"));
    }
  }

  function renderSubcontractors() {
    var tbody = document.getElementById("draft-subcontractors");
    tbody.innerHTML = "";
    draft.subcontractors.forEach(function (s) {
      var tr = document.createElement("tr");
      tr.appendChild(el("td", null, "聞き取り: " + s.raw_text));
      var selTd = document.createElement("td");
      selTd.appendChild(buildSelect(CONF.masters.subcontractors, s.matched ? s.id : null, "subcontractor"));
      tr.appendChild(selTd);
      var countTd = document.createElement("td");
      var countInput = el("input", { type: "number", min: "1", value: s.count, "data-role": "subcontractor-count", style: "width:5em" });
      countTd.appendChild(countInput);
      countTd.appendChild(document.createTextNode(" 台"));
      tr.appendChild(countTd);
      tbody.appendChild(tr);
    });
    if (!draft.subcontractors.length) {
      tbody.appendChild(el("tr", null, null)).appendChild(el("td", { colspan: "3" }, "傭車は抽出されませんでした"));
    }
  }

  function renderDraft(data) {
    draft = data;
    document.getElementById("draft-card").style.display = "";
    renderWarnings(draft.warnings);
    renderClientSite();
    document.getElementById("draft-total").textContent = draft.total_trucks !== null ? draft.total_trucks + "台" : "(抽出できませんでした)";
    document.getElementById("draft-time").textContent = draft.start_time || "(抽出できませんでした)";
    renderOwnVehicles();
    renderSubcontractors();
    document.getElementById("commit-messages").innerHTML = "";
  }

  function collectCommitPayload() {
    var clientSelect = document.querySelector('#draft-client select[data-role="client"]');
    var siteSelect = document.querySelector('#draft-site select[data-role="site"]');
    var ownVehicles = Array.from(document.querySelectorAll('#draft-own-vehicles select[data-role="own_vehicle"]'))
      .map(function (sel) { return { id: sel.value ? parseInt(sel.value, 10) : null }; })
      .filter(function (v) { return v.id; });
    var subcontractorRows = document.querySelectorAll("#draft-subcontractors tr");
    var subcontractors = [];
    subcontractorRows.forEach(function (row) {
      var sel = row.querySelector('select[data-role="subcontractor"]');
      var countInput = row.querySelector('[data-role="subcontractor-count"]');
      if (!sel || !countInput) return;
      var id = sel.value ? parseInt(sel.value, 10) : null;
      var count = countInput.value ? parseInt(countInput.value, 10) : null;
      if (id && count) subcontractors.push({ id: id, count: count });
    });

    return {
      dispatch_date: document.getElementById("dispatch-date").value,
      client: { id: clientSelect.value ? parseInt(clientSelect.value, 10) : null },
      site: { id: siteSelect.value ? parseInt(siteSelect.value, 10) : null },
      start_time: draft.start_time,
      own_vehicles: ownVehicles,
      subcontractors: subcontractors,
    };
  }

  document.addEventListener("DOMContentLoaded", function () {
    document.getElementById("parse-btn").addEventListener("click", function () {
      var payload = {
        dispatch_date: document.getElementById("dispatch-date").value,
        text: document.getElementById("transcript-text").value,
      };
      fetch(CONF.parseUrl, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      })
        .then(function (res) { return res.json(); })
        .then(renderDraft);
    });

    document.getElementById("commit-btn").addEventListener("click", function () {
      var payload = collectCommitPayload();
      fetch(CONF.commitUrl, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      })
        .then(function (res) { return res.json().then(function (data) { return { status: res.status, data: data }; }); })
        .then(function (result) {
          var box = document.getElementById("commit-messages");
          box.innerHTML = "";
          if (result.status === 200 && result.data.ok) {
            window.location.href = CONF.gridUrlTemplate + "?date=" + encodeURIComponent(payload.dispatch_date);
            return;
          }
          var ul = document.createElement("ul");
          ul.className = "needs-review";
          (result.data.messages || ["登録に失敗しました"]).forEach(function (m) {
            ul.appendChild(el("li", null, m));
          });
          box.appendChild(ul);
        });
    });
  });
})();
