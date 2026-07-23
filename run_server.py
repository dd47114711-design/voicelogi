# -*- coding: utf-8 -*-
"""社内PCでこのスクリプトを起動すると、同じLAN内のタブレット・PCから
ブラウザでアクセスできるようになる(クラウドホスティング不要、
インターネット接続不要)。

起動方法: python3 run_server.py
既定では 0.0.0.0:8000 で待ち受ける(環境変数 VOICELOGI_PORT で変更可)。

社内PCのIPアドレスが 192.168.1.10 だとすると、他の端末からは
http://192.168.1.10:8000/          … 事務員用(ログイン画面)
http://192.168.1.10:8000/chairman/ … 会長用(会長専用タブレットのホーム画面に設定する)
でアクセスする。
"""
import os

from waitress import serve

from app import create_app

if __name__ == "__main__":
    app = create_app()
    port = int(os.environ.get("VOICELOGI_PORT", "8000"))
    print(f"起動しました。社内LAN内の端末から http://<このPCのIPアドレス>:{port}/ でアクセスできます。")
    serve(app, host="0.0.0.0", port=port)
