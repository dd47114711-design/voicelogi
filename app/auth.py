# -*- coding: utf-8 -*-
"""事務員の『名前を選ぶだけ』ログイン。パスワードなし。
なりすまし防止のための認証ではなく、「誰が入力したか」を事務員間で
確認できる作業ログとしての位置づけ(2回目レビューで明文化)。"""
from functools import wraps

from flask import redirect, request, session, url_for


def login_required(view):
    @wraps(view)
    def wrapped(*args, **kwargs):
        if not session.get("staff_name"):
            return redirect(url_for("auth.login", next=request.path))
        return view(*args, **kwargs)

    return wrapped


def current_staff():
    return session.get("staff_name")
