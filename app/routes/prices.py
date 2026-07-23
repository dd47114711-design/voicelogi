# -*- coding: utf-8 -*-
import os
import tempfile

from flask import Blueprint, g, redirect, render_template, request, send_file, url_for

from .. import models
from ..auth import current_staff, login_required
from ..export import excel_export

bp = Blueprint("prices", __name__, url_prefix="/prices")


@bp.route("")
@login_required
def index():
    prices = models.list_all_prices(g.db)
    return render_template("staff/prices.html", prices=prices, categories=models.CATEGORIES)


@bp.route("/needs-review")
@login_required
def needs_review():
    prices = [p for p in models.list_all_prices(g.db) if p["amount"] is None and p["note"]]
    return render_template("staff/prices_needs_review.html", prices=prices)


@bp.route("/needs-review/print")
@login_required
def print_needs_review():
    wb = excel_export.build_price_review_worksheet(g.db)
    fd, path = tempfile.mkstemp(suffix=".xlsx", prefix="単価確認シート_")
    os.close(fd)
    wb.save(path)
    return send_file(path, as_attachment=False, download_name="単価確認シート.xlsx")


@bp.route("/<int:client_id>/<category>/update", methods=["POST"])
@login_required
def update(client_id, category):
    amount = request.form.get("amount") or None
    note = request.form.get("note") or None
    effective_date = request.form.get("effective_date") or None
    models.upsert_price(
        g.db, client_id, category,
        amount=int(amount) if amount else None, note=note, effective_date=effective_date,
        updated_by=current_staff(),
    )
    next_url = request.form.get("next") or url_for("prices.index")
    return redirect(next_url)
