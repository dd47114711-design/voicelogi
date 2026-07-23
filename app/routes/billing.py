# -*- coding: utf-8 -*-
"""実績整理(事務員用)。配車入力の内容に区分・数量・単価を追記し『実績確定』にする。
単価は単価表から自動提案するが自動入力はしない(要確認データを誤って信用しないため)。
このステップは1日10〜30件よりずっと低頻度(期間まとめて)なので、グリッドの
自動下書き保存ではなく、明示的なフォーム送信(一括確定)で十分と判断した。"""
import datetime

from flask import Blueprint, g, redirect, render_template, request, url_for

from .. import models
from ..auth import current_staff, login_required

bp = Blueprint("billing", __name__, url_prefix="/billing")


@bp.route("")
@login_required
def index():
    clients = models.list_clients(g.db)
    client_id = request.args.get("client_id", type=int)
    today = datetime.date.today()
    period_start = request.args.get("period_start") or today.replace(day=1).isoformat()
    period_end = request.args.get("period_end") or today.isoformat()

    entries = []
    price_suggestions = {}
    client = None
    if client_id:
        client = models.get_client(g.db, client_id)
        entries = [
            e for e in models.list_dispatch_entries(g.db, client_id=client_id)
            if period_start <= e["entry_date"] <= period_end
        ]
        for row in models.get_prices_for_client(g.db, client_id):
            if row is None:
                continue
            price_suggestions[row["category"]] = {"amount": row["amount"], "note": row["note"]}

    return render_template(
        "staff/billing.html", clients=clients, client=client, client_id=client_id,
        period_start=period_start, period_end=period_end, entries=entries,
        price_suggestions=price_suggestions, categories=models.CATEGORIES,
    )


@bp.route("/confirm", methods=["POST"])
@login_required
def confirm():
    client_id = request.form.get("client_id", type=int)
    period_start = request.form["period_start"]
    period_end = request.form["period_end"]
    operator = current_staff()

    entry_ids = request.form.getlist("entry_id")
    for entry_id in entry_ids:
        if not request.form.get(f"checked_{entry_id}"):
            continue
        category = request.form.get(f"category_{entry_id}") or None
        quantity = request.form.get(f"quantity_{entry_id}") or None
        unit_price = request.form.get(f"unit_price_{entry_id}") or None
        models.confirm_entry_result(
            g.db, int(entry_id), category=category,
            quantity=float(quantity) if quantity else None,
            unit_price=int(unit_price) if unit_price else None,
            operator=operator, checked=1,
        )

    return redirect(url_for(
        "billing.index", client_id=client_id, period_start=period_start, period_end=period_end
    ))
