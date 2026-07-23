# -*- coding: utf-8 -*-
"""請求書プレビュー・発行、月末締め作業(事務員用)。
見た目は scripts/build_dispatch.py の請求書シートを踏襲した app/export/excel_export.py
を使う。発行時点の金額・登録番号は models.create_invoice で invoices に固定保存し、
以後マスタが変わっても過去の請求書内容は変わらない。"""
import datetime
import os

from flask import (
    Blueprint, current_app, g, redirect, render_template, request, send_file, url_for,
)

from .. import models
from ..auth import current_staff, login_required
from ..export import excel_export, pdf_export

bp = Blueprint("invoice", __name__, url_prefix="/invoices")

OUTPUT_DIR = os.path.join(os.path.dirname(__file__), "..", "..", "output", "invoices")


@bp.route("/closing")
@login_required
def closing():
    today = datetime.date.today()
    period_start = request.args.get("period_start") or today.replace(day=1).isoformat()
    period_end = request.args.get("period_end") or today.isoformat()
    hide_zero = request.args.get("hide_zero", "1") == "1"
    summary = models.list_billing_summary(g.db, period_start, period_end, only_unbilled=hide_zero)
    recent_invoices = models.list_invoices(g.db)[:20]
    return render_template(
        "staff/invoice_closing.html", summary=summary, period_start=period_start,
        period_end=period_end, recent_invoices=recent_invoices, hide_zero=hide_zero,
    )


@bp.route("/new")
@login_required
def new():
    client_id = request.args.get("client_id", type=int)
    period_start = request.args["period_start"]
    period_end = request.args["period_end"]
    client = models.get_client(g.db, client_id)
    billable = models.list_billable_entries(g.db, client_id, period_start, period_end)
    subtotal = sum((e["quantity"] or 0) * (e["unit_price"] or 0) for e in billable)
    return render_template(
        "staff/invoice_new.html", client=client, billable=billable,
        period_start=period_start, period_end=period_end, subtotal=round(subtotal),
    )


@bp.route("", methods=["POST"])
@login_required
def create():
    client_id = request.form.get("client_id", type=int)
    period_start = request.form["period_start"]
    period_end = request.form["period_end"]
    client = models.get_client(g.db, client_id)
    company = models.get_company_profile(g.db)

    billable = models.list_billable_entries(g.db, client_id, period_start, period_end)
    if not billable:
        return redirect(url_for(
            "invoice.closing", period_start=period_start, period_end=period_end
        ))

    subtotal = round(sum((e["quantity"] or 0) * (e["unit_price"] or 0) for e in billable))
    tax_rate = 0.10
    tax_amount = round(subtotal * tax_rate)
    total_amount = subtotal + tax_amount

    invoice_id = models.create_invoice(
        g.db, client_id, datetime.date.today().isoformat(), period_start, period_end,
        client_name_snapshot=client["name"],
        issuer_name_snapshot=company["company_name"] if company else "(未設定)",
        issuer_registration_number_snapshot=company["registration_number"] if company else None,
        subtotal_amount=subtotal, tax_amount=tax_amount, total_amount=total_amount,
        tax_rate=tax_rate, created_by=current_staff(),
    )

    for i, e in enumerate(billable):
        amount = round((e["quantity"] or 0) * (e["unit_price"] or 0))
        models.add_invoice_line(
            g.db, invoice_id, e["id"], i, e["entry_date"], e["client_name_snapshot"] or client["name"],
            e["count"], e["quantity"], e["unit_price"], amount, e["vehicle_no"], e["memo"],
        )

    _regenerate_files(g.db, invoice_id)
    return redirect(url_for("invoice.view", invoice_id=invoice_id))


def _regenerate_files(conn, invoice_id):
    os.makedirs(OUTPUT_DIR, exist_ok=True)
    wb = excel_export.build_invoice_workbook(conn, invoice_id)
    basename = pdf_export.unique_output_basename(f"invoice_{invoice_id}")
    xlsx_path = os.path.join(OUTPUT_DIR, f"{basename}.xlsx")
    wb.save(xlsx_path)
    try:
        pdf_path = pdf_export.convert_xlsx_to_pdf(xlsx_path, OUTPUT_DIR)
    except pdf_export.PdfConversionError:
        pdf_path = None
    models.set_invoice_files(conn, invoice_id, xlsx_path, pdf_path)


@bp.route("/<int:invoice_id>")
@login_required
def view(invoice_id):
    invoice = models.get_invoice(g.db, invoice_id)
    lines = models.list_invoice_lines(g.db, invoice_id)
    reviews = models.list_invoice_reviews(g.db, invoice_id)
    return render_template("staff/invoice_view.html", invoice=invoice, lines=lines, reviews=reviews)


@bp.route("/<int:invoice_id>/lines/<int:line_id>/toggle-dash", methods=["POST"])
@login_required
def toggle_dash(invoice_id, line_id):
    line = g.db.execute("SELECT * FROM invoice_lines WHERE id = ?", (line_id,)).fetchone()
    if line is None:
        return redirect(url_for("invoice.view", invoice_id=invoice_id))
    invoice = models.get_invoice(g.db, invoice_id)
    client = models.get_client(g.db, invoice["client_id"])
    new_name = "〃" if line["display_name"] != "〃" else (client["name"] if client else "")
    models.update_invoice_line_display_name(g.db, line_id, new_name)
    _regenerate_files(g.db, invoice_id)
    return redirect(url_for("invoice.view", invoice_id=invoice_id))


@bp.route("/<int:invoice_id>/download.xlsx")
@login_required
def download_xlsx(invoice_id):
    invoice = models.get_invoice(g.db, invoice_id)
    if not invoice or not invoice["xlsx_path"]:
        return redirect(url_for("invoice.view", invoice_id=invoice_id))
    return send_file(invoice["xlsx_path"], as_attachment=True,
                      download_name=f"請求書_{invoice['client_name_snapshot']}_{invoice['invoice_date']}.xlsx")


@bp.route("/<int:invoice_id>/download.pdf")
@login_required
def download_pdf(invoice_id):
    invoice = models.get_invoice(g.db, invoice_id)
    if not invoice or not invoice["pdf_path"]:
        return redirect(url_for("invoice.view", invoice_id=invoice_id))
    return send_file(invoice["pdf_path"], as_attachment=True,
                      download_name=f"請求書_{invoice['client_name_snapshot']}_{invoice['invoice_date']}.pdf")
