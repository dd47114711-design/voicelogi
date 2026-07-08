# -*- coding: utf-8 -*-
from flask import Blueprint, g, redirect, render_template, request, session, url_for

from .. import models

bp = Blueprint("auth", __name__)


@bp.route("/login", methods=["GET", "POST"])
def login():
    if request.method == "POST":
        name = request.form.get("name", "").strip()
        if not name:
            staff = models.list_staff_members(g.db)
            return render_template(
                "staff/login.html", staff=staff, recent=request.cookies.get("last_staff_name"),
                error="名前を選んでください",
            )
        models.get_or_create_staff_member(g.db, name)
        session.permanent = True
        session["staff_name"] = name
        next_url = request.args.get("next") or url_for("home.index")
        resp = redirect(next_url)
        resp.set_cookie("last_staff_name", name, max_age=60 * 60 * 24 * 90)
        return resp

    staff = models.list_staff_members(g.db)
    return render_template(
        "staff/login.html", staff=staff, recent=request.cookies.get("last_staff_name"), error=None
    )


@bp.route("/logout", methods=["POST"])
def logout():
    session.pop("staff_name", None)
    return redirect(url_for("auth.login"))
