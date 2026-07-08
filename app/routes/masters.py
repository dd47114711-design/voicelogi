# -*- coding: utf-8 -*-
"""マスタ管理(事務員用)。元請・車両・運転手・傭車・自社情報(請求書発行元)。
現場名は今回、頻繁に変わる自由記述として dispatch_entries.site_name_snapshot に
直接持たせており、独立したマスタ画面は用意していない(将来、現場ごとの集計が
必要になった場合に sites テーブルへの正式な連携を追加する)。"""
from flask import Blueprint, g, jsonify, redirect, render_template, request, url_for

from .. import models
from ..auth import login_required

bp = Blueprint("masters", __name__, url_prefix="/masters")

_QUICK_ADD_ENTITIES = {"clients", "drivers", "subcontractors", "vehicles"}


@bp.route("")
@login_required
def index():
    return render_template(
        "staff/masters.html",
        clients=models.list_clients(g.db),
        vehicles=models.list_vehicles(g.db),
        drivers=models.list_drivers(g.db),
        subcontractors=models.list_subcontractors(g.db),
        company=models.get_company_profile(g.db),
    )


@bp.route("/clients/add", methods=["POST"])
@login_required
def add_client():
    name = request.form.get("name", "").strip()
    if name:
        models.create_client(g.db, name)
    return redirect(url_for("masters.index"))


@bp.route("/clients/<int:client_id>/deactivate", methods=["POST"])
@login_required
def deactivate_client(client_id):
    models.deactivate_client(g.db, client_id)
    return redirect(url_for("masters.index"))


@bp.route("/vehicles/add", methods=["POST"])
@login_required
def add_vehicle():
    plate_no = request.form.get("plate_no", "").strip()
    if plate_no:
        models.create_vehicle(g.db, plate_no, vehicle_type=request.form.get("vehicle_type") or None)
    return redirect(url_for("masters.index"))


@bp.route("/vehicles/<int:vehicle_id>/deactivate", methods=["POST"])
@login_required
def deactivate_vehicle(vehicle_id):
    models.deactivate_vehicle(g.db, vehicle_id)
    return redirect(url_for("masters.index"))


@bp.route("/drivers/add", methods=["POST"])
@login_required
def add_driver():
    name = request.form.get("name", "").strip()
    if name:
        models.create_driver(g.db, name, phone=request.form.get("phone") or None)
    return redirect(url_for("masters.index"))


@bp.route("/drivers/<int:driver_id>/deactivate", methods=["POST"])
@login_required
def deactivate_driver(driver_id):
    models.deactivate_driver(g.db, driver_id)
    return redirect(url_for("masters.index"))


@bp.route("/subcontractors/add", methods=["POST"])
@login_required
def add_subcontractor():
    name = request.form.get("name", "").strip()
    if name:
        models.create_subcontractor(g.db, name, contact=request.form.get("contact") or None)
    return redirect(url_for("masters.index"))


@bp.route("/subcontractors/<int:subcontractor_id>/deactivate", methods=["POST"])
@login_required
def deactivate_subcontractor(subcontractor_id):
    models.deactivate_subcontractor(g.db, subcontractor_id)
    return redirect(url_for("masters.index"))


@bp.route("/company", methods=["POST"])
@login_required
def update_company():
    models.set_company_profile(
        g.db,
        company_name=request.form.get("company_name", "").strip(),
        registration_number=request.form.get("registration_number") or None,
        address=request.form.get("address") or None,
        phone=request.form.get("phone") or None,
        bank_info=request.form.get("bank_info") or None,
    )
    return redirect(url_for("masters.index"))


@bp.route("/quick-add/<entity>", methods=["POST"])
@login_required
def quick_add(entity):
    """配車入力グリッドのドロップダウン内「+新規登録...」から呼ばれるJSON API。"""
    if entity not in _QUICK_ADD_ENTITIES:
        return jsonify({"error": "unknown_entity"}), 400
    name = (request.get_json(silent=True) or {}).get("name", "").strip()
    if not name:
        return jsonify({"error": "name_required"}), 400

    if entity == "clients":
        new_id = models.create_client(g.db, name)
    elif entity == "drivers":
        new_id = models.create_driver(g.db, name)
    elif entity == "subcontractors":
        new_id = models.create_subcontractor(g.db, name)
    elif entity == "vehicles":
        new_id = models.create_vehicle(g.db, name)
    else:
        return jsonify({"error": "unsupported_entity"}), 400

    return jsonify({"id": new_id, "name": name})
