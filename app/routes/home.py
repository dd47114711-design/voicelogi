# -*- coding: utf-8 -*-
from flask import Blueprint, g, render_template

from .. import models
from ..auth import login_required

bp = Blueprint("home", __name__)


@bp.route("/")
@login_required
def index():
    alerts = models.list_open_staff_alerts(g.db)
    return render_template("staff/home.html", alerts=alerts)
