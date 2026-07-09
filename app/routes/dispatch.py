# -*- coding: utf-8 -*-
"""配車入力(事務員用・グリッド)。

設計方針(レビュー反映):
- 画面に表示される行は常にDBの実レコード(『空の未保存行』という概念を持たない)。
  「+行を追加」は即座に空レコードをINSERTし、そのレコードのidをフロントが持つ。
  こうすることで自動下書き保存のロジックが単純になる(常にUPDATEだけで済む)。
- グリッドを開いた時点で末尾に必ず1行、空行が残るようにする(Excelの「常に次の
  行が待っている」感覚を再現)。
- 保存は「セルからフォーカスが外れたら自動下書き保存」+「明示的な保存を確定する
  ボタン」のハイブリッド。競合検知は dispatch_entries.version を使う。
"""
import datetime
import os
import tempfile

from flask import Blueprint, g, jsonify, redirect, render_template, request, send_file, url_for

from .. import models
from ..auth import login_required
from ..export import excel_export

bp = Blueprint("dispatch", __name__, url_prefix="/dispatch")

_UPDATABLE_FIELDS = (
    "client_id", "site_id", "count", "vehicle_id", "driver_id",
    "is_subcontractor", "subcontractor_id", "memo",
)


def _is_blank(entry):
    return entry["client_id"] is None and entry["count"] is None


def _masters(conn):
    return {
        "clients": models.list_clients(conn),
        "sites": models.list_sites(conn),
        "vehicles": models.list_vehicles(conn),
        "drivers": models.list_drivers(conn),
        "subcontractors": models.list_subcontractors(conn),
    }


def _parse_date(value):
    try:
        return datetime.date.fromisoformat(value)
    except (TypeError, ValueError):
        return datetime.date.today()


@bp.route("")
@login_required
def grid():
    date_str = request.args.get("date") or datetime.date.today().isoformat()
    day = _parse_date(date_str)
    date_str = day.isoformat()

    entries = models.list_dispatch_entries(g.db, entry_date=date_str)
    if not entries or not _is_blank(entries[-1]):
        models.create_dispatch_entry(g.db, date_str)
        entries = models.list_dispatch_entries(g.db, entry_date=date_str)

    masters = _masters(g.db)
    # sites はJS側(dispatch.js)にJSONとして埋め込んで元請変更時のクライアント側
    # フィルタに使うため、sqlite3.Rowのままだと tojson でシリアライズできない。
    # dictのリストに変換しておく(Jinjaループでの参照方法は変わらない)。
    masters["sites"] = [dict(s) for s in masters["sites"]]

    return render_template(
        "staff/dispatch_grid.html",
        entries=entries,
        date=day,
        date_str=date_str,
        prev_date=(day - datetime.timedelta(days=1)).isoformat(),
        next_date=(day + datetime.timedelta(days=1)).isoformat(),
        **masters,
    )


@bp.route("/entries", methods=["POST"])
@login_required
def create_entry():
    date_str = request.form.get("entry_date") or datetime.date.today().isoformat()
    entry_id = models.create_dispatch_entry(g.db, date_str)
    entry = models.get_dispatch_entry(g.db, entry_id)
    return render_template("staff/_dispatch_row.html", entry=entry, **_masters(g.db))


@bp.route("/entries/<int:entry_id>/duplicate", methods=["POST"])
@login_required
def duplicate_entry(entry_id):
    src = models.get_dispatch_entry(g.db, entry_id)
    if src is None:
        return jsonify({"error": "not_found"}), 404
    new_id = models.create_dispatch_entry(
        g.db, src["entry_date"], client_id=src["client_id"],
        client_name_snapshot=src["client_name_snapshot"],
        site_id=src["site_id"], site_name_snapshot=src["site_name_snapshot"], count=src["count"],
        vehicle_id=src["vehicle_id"], driver_id=src["driver_id"],
        is_subcontractor=src["is_subcontractor"], subcontractor_id=src["subcontractor_id"],
        subcontractor_name_snapshot=src["subcontractor_name_snapshot"], memo=src["memo"],
    )
    entry = models.get_dispatch_entry(g.db, new_id)
    return render_template("staff/_dispatch_row.html", entry=entry, **_masters(g.db))


@bp.route("/entries/<int:entry_id>/update", methods=["POST"])
@login_required
def update_entry(entry_id):
    payload = request.get_json(silent=True) or {}
    fields = payload.get("fields", {})
    expected_version = payload.get("expected_version")

    unknown = set(fields) - set(_UPDATABLE_FIELDS)
    if unknown:
        return jsonify({"error": "unknown_fields", "fields": sorted(unknown)}), 400

    clean = {}
    for key, value in fields.items():
        if value == "":
            clean[key] = None
        elif key in ("client_id", "site_id", "vehicle_id", "driver_id", "subcontractor_id", "count"):
            clean[key] = int(value) if value is not None else None
        elif key == "is_subcontractor":
            clean[key] = 1 if value else 0
        else:
            clean[key] = value

    if "client_id" in clean:
        client = models.get_client(g.db, clean["client_id"]) if clean["client_id"] else None
        clean["client_name_snapshot"] = client["name"] if client else None

    if "site_id" in clean:
        site = models.get_site(g.db, clean["site_id"]) if clean["site_id"] else None
        clean["site_name_snapshot"] = site["name"] if site else None

    try:
        models.update_dispatch_entry(g.db, entry_id, expected_version=expected_version, **clean)
    except models.ConcurrentUpdateError as e:
        return jsonify({"error": "conflict", "message": str(e)}), 409
    except ValueError as e:
        return jsonify({"error": "invalid", "message": str(e)}), 400

    entry = models.get_dispatch_entry(g.db, entry_id)
    return jsonify({"ok": True, "version": entry["version"]})


@bp.route("/entries/<int:entry_id>/delete", methods=["POST"])
@login_required
def delete_entry(entry_id):
    entry = models.get_dispatch_entry(g.db, entry_id)
    if entry is None:
        return jsonify({"error": "not_found"}), 404
    if entry["status"] != "予定" or entry["invoice_id"] is not None:
        return jsonify({"error": "not_deletable", "message": "実績確定済み・請求済みの行は削除できません"}), 400
    g.db.execute("DELETE FROM dispatch_entries WHERE id = ?", (entry_id,))
    g.db.commit()
    return jsonify({"ok": True})


@bp.route("/copy-previous-day", methods=["POST"])
@login_required
def copy_previous_day():
    date_str = request.form.get("date") or datetime.date.today().isoformat()
    day = _parse_date(date_str)
    prev_day = (day - datetime.timedelta(days=1)).isoformat()

    prev_entries = [e for e in models.list_dispatch_entries(g.db, entry_date=prev_day) if not _is_blank(e)]
    for e in prev_entries:
        models.create_dispatch_entry(
            g.db, day.isoformat(), client_id=e["client_id"], client_name_snapshot=e["client_name_snapshot"],
            site_id=e["site_id"], site_name_snapshot=e["site_name_snapshot"], count=e["count"], vehicle_id=e["vehicle_id"],
            driver_id=e["driver_id"], is_subcontractor=e["is_subcontractor"],
            subcontractor_id=e["subcontractor_id"], subcontractor_name_snapshot=e["subcontractor_name_snapshot"],
            memo=e["memo"],
        )
    return redirect(url_for("dispatch.grid", date=day.isoformat()))


@bp.route("/print")
@login_required
def print_day():
    date_str = request.args.get("date") or datetime.date.today().isoformat()
    wb = excel_export.build_dispatch_day_workbook(g.db, date_str)
    fd, path = tempfile.mkstemp(suffix=".xlsx", prefix=f"配車表_{date_str}_")
    os.close(fd)
    wb.save(path)
    return send_file(path, as_attachment=False, download_name=f"配車表_{date_str}.xlsx")


@bp.route("/search")
@login_required
def search():
    q = request.args.get("q", "").strip()
    results = []
    if q:
        rows = g.db.execute(
            """
            SELECT dispatch_entries.*, clients.name AS client_name
            FROM dispatch_entries
            LEFT JOIN clients ON clients.id = dispatch_entries.client_id
            LEFT JOIN vehicles ON vehicles.id = dispatch_entries.vehicle_id
            LEFT JOIN drivers ON drivers.id = dispatch_entries.driver_id
            WHERE clients.name LIKE ? OR vehicles.plate_no LIKE ? OR drivers.name LIKE ?
               OR dispatch_entries.site_name_snapshot LIKE ?
            ORDER BY dispatch_entries.entry_date DESC LIMIT 100
            """,
            tuple(f"%{q}%" for _ in range(4)),
        ).fetchall()
        results = rows
    return render_template("staff/dispatch_search.html", q=q, results=results)
