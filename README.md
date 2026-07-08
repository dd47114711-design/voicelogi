# 配車・請求システム (voicelogi)

トラック配車会社向けの配車〜請求書作成システム。会長がパソコンを一切操作できない
という制約と、事務員は日常的にExcelで配車入力しているという実情を踏まえ、
**入力は事務員向けのシンプルなWebフォーム、出力(請求書・配車表)は既存Excel
(`scripts/build_dispatch.py`)の見た目をそのまま踏襲する**ハイブリッド構成にしている。

設計の経緯・比較検討・レビュー結果はこのリポジトリのコミット履歴、および
セッション内のやり取りに記録されている。要点:

- 過去に一度、Excel帳票を自動化しすぎて「紙帳票から見た目が離れすぎた」と
  差し戻された経緯があるため、**請求書・配車表の見た目は今回も変更しない**
- 会長用画面と事務員用画面は完全に別のテンプレート・別のURL
  (`/chairman/...` と それ以外)に分離している。会長用テンプレートは
  事務員画面へのリンクを一切含まない(なりすまし・誤操作対策の主防御)

## セットアップ

```bash
python3 -m pip install -r requirements.txt
```

LibreOffice (PDF変換用) が必要。Calc(表計算)コンポーネントが入っていないと
`soffice --convert-to pdf` が "source file could not be loaded" で失敗するので注意:

```bash
sudo apt-get install libreoffice-calc
```

## 初期データ投入(初回のみ)

```bash
python3 scripts/migrate_price_data.py   # scripts/price_data.json -> data/price_master.json
python3 scripts/seed_db.py              # data/price_master.json -> data/voicelogi.db
```

どちらも再実行しても安全(冪等)。`data/voicelogi.db` は `.gitignore` されているため、
新しい環境では必ずこの手順でDBを作り直す。

## 起動方法

### 開発時(自分のPCで試す)

```bash
python3 -m flask --app 'app:create_app()' run --debug
```

### 実運用(社内PCでLAN内サーバーとして常時起動)

```bash
python3 run_server.py
```

`0.0.0.0:8000` で待ち受ける。社内PCのIPアドレスが `192.168.1.10` なら、
同じLAN内のタブレット・PCから:

- 事務員用: `http://192.168.1.10:8000/`
- 会長用: `http://192.168.1.10:8000/chairman/`

でアクセスする。**インターネット接続もクラウドサーバーも不要**。

## 会長用タブレットの設定(重要)

会長は一切PC操作をしない前提のため、会長用タブレットは以下のように設定する:

1. ブラウザで `http://<社内PCのIP>:8000/chairman/` を開き、ホーム画面にアイコンとして
   追加する(あるいはブラウザのキオスクモード機能で固定する)
2. タブレットは常時給電クレードルに置き、**電源を切らない**。スリープからは
   画面タップだけで復帰するよう設定する(会長に電源ボタン操作をさせない)
3. なりすまし・誤操作対策は `/chairman/` 配下のサーバー側ロール分離を主防御としており、
   タブレット側のキオスク設定はあくまで補助。**キオスク設定が万一外れても、
   会長用画面自体に事務員機能への導線は存在しない**ため、致命的な誤操作には
   つながらない設計にしている
4. 月1回程度、事務員がタブレットの起動確認を行う運用ルールとする

### 障害時のフォールバック

システムが落ちている・LANがつながらない場合は、**今まで通り紙に手書きして、
復旧後に事務員がまとめてシステムに入力する**。新しい操作を紙の代わりに
強制することはない。

## バックアップ

```bash
python3 scripts/backup_db.py
```

`data/backups/` に日次バックアップを作成し、30日より古いものは自動削除する。
cronに登録して毎日実行することを推奨:

```
0 3 * * * cd /path/to/voicelogi && python3 scripts/backup_db.py >> /var/log/voicelogi_backup.log 2>&1
```

事務員が月1回、`data/backups/` の中に最近の日付のファイルがあるか目視確認する
運用ルールとする(IT担当者不在のため、自動化だけに頼らない)。

## 動作確認

```bash
python3 scripts/smoke_test.py
```

ログイン、配車入力の自動下書き保存・競合検知、実績整理、請求書発行(Excel/PDF生成)、
会長用画面の一連の流れを一通り確認する使い捨てスクリプト。

## ディレクトリ構成

```
app/
  models.py, db.py, schema.sql   … SQLiteデータ層
  routes/                        … Flaskルート(事務員用・会長用)
  templates/staff/               … 事務員用画面(キーボード最適化のグリッド)
  templates/chairman/            … 会長用画面(大ボタン・読み取り専用中心)
  export/
    styles.py                    … scripts/build_dispatch.py のスタイル定義を移植
    excel_export.py              … DB駆動での請求書・配車表Excel生成
    pdf_export.py                … LibreOffice headlessでのPDF変換
scripts/
  build_dispatch.py              … 元のExcel生成スクリプト(参照用に残置、削除しない)
  migrate_price_data.py          … 単価データの一次移行(曖昧値はnoteとして保持)
  seed_db.py                     … DB初期投入(冪等)
  backup_db.py                   … 日次バックアップ
  smoke_test.py                  … E2E動作確認
data/
  price_master.json              … 移行済みの単価マスタ(price_data.jsonは履歴として残置)
  voicelogi.db                   … SQLite本体(gitignore対象、再生成可能)
run_server.py                    … 本番運用起動スクリプト(waitress)
```

## 既知の簡略化・今後の課題

- 現場名(`site_name_snapshot`)は自由記述にしており、独立したマスタ画面は
  未整備(`sites`テーブルは存在するが未使用)。現場ごとの集計が必要になったら
  正式に連携する
- 「ちがう気がする」通知は事務員トップ画面のバッジ表示のみ(外部通知サービスは
  運用負荷になるため不採用と判断した)。事務員がアプリを開くまで気づけない点は
  許容している
- 消費税は単一税率(10%)のみ対応。トラック輸送は軽減税率の対象外のため、
  複数税率対応はスコープ外とした
- 単価表の曖昧データ(日付・電話番号混入、約25件)は自動分解せず備考として
  残しているため、`/prices/needs-review` で一覧を見て手動で実際の単価に
  置き換える必要がある(初回運用前に対応推奨)
- `app/models.py` の `update_dispatch_entry` はカラムをホワイトリストで制限しているが、
  正式な認証(パスワード等)は導入していない。会長1名+事務員数名という
  小規模組織を前提に、「なりすまし防止」ではなく「作業ログ」として割り切っている
