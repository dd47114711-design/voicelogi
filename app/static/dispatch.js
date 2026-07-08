// 配車入力グリッドの挙動: Tab/Enterでのセル・行移動、行ごとの自動下書き保存、
// 「+新規登録...」でのマスタ即時追加、複製・削除。
// IME変換確定のEnterと行送りのEnterを区別するため compositionstart/compositionend を使う。
(function () {
  "use strict";
  var CONF = window.VOICELOGI;
  var SAVE_DEBOUNCE_MS = 500;
  var saveTimers = new WeakMap();

  function tbody() {
    return document.getElementById("dispatch-tbody");
  }

  function renumberRows() {
    var rows = tbody().querySelectorAll("tr.dispatch-row");
    rows.forEach(function (row, i) {
      row.querySelector(".row-no").textContent = i + 1;
    });
  }

  function fieldsOf(row) {
    var result = {};
    row.querySelectorAll("[data-field]").forEach(function (el) {
      var key = el.dataset.field;
      if (el.type === "checkbox") {
        result[key] = el.checked ? 1 : 0;
      } else {
        result[key] = el.value;
      }
    });
    return result;
  }

  function setSyncState(row, state, message) {
    var icon = row.querySelector(".sync-icon");
    icon.classList.remove("sync-ok", "sync-pending", "sync-error");
    if (state === "ok") {
      icon.classList.add("sync-ok");
      icon.textContent = "●同期済み";
    } else if (state === "pending") {
      icon.classList.add("sync-pending");
      icon.textContent = "○未保存";
    } else {
      icon.classList.add("sync-error");
      icon.textContent = "✕" + (message || "保存失敗") + " ";
      var retry = document.createElement("button");
      retry.type = "button";
      retry.textContent = "再送信";
      retry.className = "secondary";
      retry.addEventListener("click", function () { saveRow(row, true); });
      icon.appendChild(retry);
    }
  }

  function saveRow(row, immediate) {
    if (saveTimers.has(row)) {
      clearTimeout(saveTimers.get(row));
    }
    var run = function () {
      setSyncState(row, "pending");
      var entryId = row.dataset.entryId;
      var url = CONF.updateUrlTemplate.replace(/\/0\/update/, "/" + entryId + "/update");
      fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ fields: fieldsOf(row), expected_version: parseInt(row.dataset.version, 10) }),
      })
        .then(function (res) {
          if (res.status === 409) {
            setSyncState(row, "error", "他の変更あり(再読込してください)");
            return null;
          }
          if (!res.ok) {
            setSyncState(row, "error");
            return null;
          }
          return res.json();
        })
        .then(function (data) {
          if (data && data.ok) {
            row.dataset.version = data.version;
            setSyncState(row, "ok");
            maybeAppendBlankRow(row);
          }
        })
        .catch(function () {
          setSyncState(row, "error");
        });
    };
    if (immediate) {
      run();
    } else {
      saveTimers.set(row, setTimeout(run, SAVE_DEBOUNCE_MS));
    }
  }

  function isRowBlank(row) {
    var clientVal = row.querySelector('[data-field="client_id"]').value;
    var countVal = row.querySelector('[data-field="count"]').value;
    return !clientVal && !countVal;
  }

  function maybeAppendBlankRow(savedRow) {
    var rows = tbody().querySelectorAll("tr.dispatch-row");
    var lastRow = rows[rows.length - 1];
    if (lastRow === savedRow && !isRowBlank(savedRow)) {
      addRow();
    }
  }

  function parseRowFragment(html) {
    var tmp = document.createElement("div");
    tmp.innerHTML = html;
    return tmp.querySelector("tr.dispatch-row");
  }

  function attachRowHandlers(row) {
    row.querySelectorAll("[data-field]").forEach(function (el) {
      if (el.tagName === "SELECT") {
        el.addEventListener("change", function () { handleSelectChange(row, el); });
      } else if (el.type === "checkbox") {
        el.addEventListener("change", function () { saveRow(row); });
      } else {
        el.addEventListener("blur", function () { saveRow(row); });
        el.addEventListener("compositionstart", function () { el.dataset.composing = "1"; });
        el.addEventListener("compositionend", function () { el.dataset.composing = ""; });
        el.addEventListener("keydown", function (ev) {
          if (ev.key === "Enter" && el.dataset.composing !== "1") {
            ev.preventDefault();
            saveRow(row, true);
            focusNextRowSameField(row, el.dataset.field);
          }
        });
      }
    });
    row.querySelector(".row-duplicate").addEventListener("click", function () { duplicateRow(row); });
    row.querySelector(".row-delete").addEventListener("click", function () { deleteRow(row); });
  }

  function handleSelectChange(row, select) {
    if (select.value === "__new__") {
      var entityMap = { client_id: "clients", vehicle_id: "vehicles", driver_id: "drivers", subcontractor_id: "subcontractors" };
      var entity = entityMap[select.dataset.field];
      var name = window.prompt("新しく登録する名前を入力してください");
      if (!name) {
        select.value = "";
        return;
      }
      var url = CONF.quickAddUrlTemplate.replace("ENTITY", entity);
      fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: name }),
      })
        .then(function (res) { return res.json(); })
        .then(function (data) {
          if (!data.id) { select.value = ""; return; }
          var opt = document.createElement("option");
          opt.value = data.id;
          opt.textContent = data.name;
          select.insertBefore(opt, select.querySelector('option[value="__new__"]'));
          select.value = data.id;
          saveRow(row, true);
        })
        .catch(function () { select.value = ""; });
      return;
    }
    saveRow(row, true);
  }

  function focusNextRowSameField(row, fieldName) {
    var next = row.nextElementSibling;
    if (!next) {
      addRow(function (newRow) {
        var target = newRow.querySelector('[data-field="' + fieldName + '"]');
        if (target) target.focus();
      });
      return;
    }
    var target = next.querySelector('[data-field="' + fieldName + '"]');
    if (target) target.focus();
  }

  function addRow(callback) {
    var body = new URLSearchParams({ entry_date: CONF.entryDate });
    fetch(CONF.createUrl, { method: "POST", body: body })
      .then(function (res) { return res.text(); })
      .then(function (html) {
        var row = parseRowFragment(html);
        tbody().appendChild(row);
        attachRowHandlers(row);
        renumberRows();
        if (callback) callback(row);
      });
  }

  function duplicateRow(row) {
    var url = CONF.duplicateUrlTemplate.replace(/\/0\/duplicate/, "/" + row.dataset.entryId + "/duplicate");
    fetch(url, { method: "POST" })
      .then(function (res) { return res.text(); })
      .then(function (html) {
        var newRow = parseRowFragment(html);
        row.parentNode.insertBefore(newRow, row.nextSibling);
        attachRowHandlers(newRow);
        renumberRows();
      });
  }

  function deleteRow(row) {
    if (!window.confirm("この行を削除しますか？")) return;
    var url = CONF.deleteUrlTemplate.replace(/\/0\/delete/, "/" + row.dataset.entryId + "/delete");
    fetch(url, { method: "POST" })
      .then(function (res) { return res.json(); })
      .then(function (data) {
        if (data.ok) {
          row.remove();
          renumberRows();
        } else {
          window.alert(data.message || "削除できませんでした");
        }
      });
  }

  document.addEventListener("DOMContentLoaded", function () {
    tbody().querySelectorAll("tr.dispatch-row").forEach(attachRowHandlers);
    renumberRows();
    document.getElementById("add-row-btn").addEventListener("click", function () { addRow(); });
  });
})();
