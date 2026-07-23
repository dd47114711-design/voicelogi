# -*- coding: utf-8 -*-
"""会長用画面。ログイン不要(会長専用タブレットからのみ開く運用を前提とする)。

設計方針(2回目レビュー反映、最重要):
会長端末のなりすまし対策は「キオスクモード」だけに頼らない。この
chairman blueprint 配下のテンプレートは事務員用画面へのリンク・フォームを
一切含めない(サーバー側のロール分離を主防御とし、OSのキオスク設定は
副防御に格下げする)。同期エラー等の技術的な詳細は会長には見せない。
"""
import datetime

from flask import Blueprint, g, redirect, render_template, request, url_for

from .. import models

bp = Blueprint("chairman", __name__, url_prefix="/chairman")


@bp.route("/")
def top():
    return render_template("chairman/top.html")


@bp.route("/today")
def today():
    date_str = datetime.date.today().isoformat()
    entries = [
        e for e in models.list_dispatch_entries(g.db, entry_date=date_str)
        if e["client_id"] is not None
    ]
    alert = models.get_open_alert_for_target(g.db, "dispatch_day", date_str)
    today_obj = datetime.date.today()
    date_display = f"{today_obj.year}年{today_obj.month}月{today_obj.day}日"
    return render_template(
        "chairman/today.html", date_display=date_display, entries=entries, alert=alert,
    )


@bp.route("/today/alert", methods=["POST"])
def raise_today_alert():
    date_str = datetime.date.today().isoformat()
    models.raise_staff_alert(g.db, "dispatch_day", date_str)
    return redirect(url_for("chairman.notified"))


@bp.route("/invoices")
def invoices():
    pending = models.list_invoices(g.db, only_unreviewed=True)
    return render_template("chairman/invoices.html", invoices=pending)


@bp.route("/invoices/<int:invoice_id>/review", methods=["POST"])
def review_invoice(invoice_id):
    models.add_invoice_review(g.db, invoice_id, reviewed_by="会長")
    return redirect(url_for("chairman.reviewed"))


@bp.route("/invoices/<int:invoice_id>/alert", methods=["POST"])
def raise_invoice_alert(invoice_id):
    models.raise_staff_alert(g.db, "invoice", str(invoice_id))
    return redirect(url_for("chairman.notified"))


@bp.route("/reviewed")
def reviewed():
    """『見ました』を押した直後の全画面フィードバック。3秒後に自動でトップへ戻る。"""
    return render_template("chairman/feedback.html", message="確認しました", icon="check")


@bp.route("/notified")
def notified():
    """『ちがう気がする』を押した直後の全画面フィードバック。3秒後に自動でトップへ戻る。"""
    return render_template("chairman/feedback.html", message="事務員に伝えました", icon="mail")
