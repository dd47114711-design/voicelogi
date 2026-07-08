# -*- coding: utf-8 -*-
import os
from datetime import timedelta

from flask import Flask, g

from . import db as db_module


def create_app():
    app = Flask(__name__)
    app.secret_key = os.environ.get("VOICELOGI_SECRET_KEY", "dev-secret-change-me-in-production")
    # 事務員ログインは日中ずっと保持し、開閉のたびに名前を選び直させない
    app.permanent_session_lifetime = timedelta(hours=12)

    db_module.init_db()

    @app.before_request
    def _open_db():
        g.db = db_module.get_connection()

    @app.teardown_request
    def _close_db(exception=None):
        conn = g.pop("db", None)
        if conn is not None:
            conn.close()

    from .routes import auth, home, dispatch, billing, prices, masters, invoice, chairman

    app.register_blueprint(auth.bp)
    app.register_blueprint(home.bp)
    app.register_blueprint(dispatch.bp)
    app.register_blueprint(billing.bp)
    app.register_blueprint(prices.bp)
    app.register_blueprint(masters.bp)
    app.register_blueprint(invoice.bp)
    app.register_blueprint(chairman.bp)

    return app
