# voicelogi

配車・出退勤ボードの新実装（Next.js + Supabase）。

## セットアップ

```bash
pnpm install
cp .env.example .env.local
# .env.local にSupabaseの接続情報を設定する
pnpm dev
```

## セキュリティに関する注意

**現時点のこのアプリを公開URLへデプロイしてはならない。**

`supabase/migrations/0002_rls_permissive.sql` で入れているRLSポリシーは、開発を進めるための
暫定の全許可ポリシー（`using (true)` / `with check (true)`）である。RLS自体は有効だが、
実質的に何も制限していない。

そのため `NEXT_PUBLIC_SUPABASE_ANON_KEY` は現状、`staff` / `sites` / `attendance_events` を
含む全テーブルへの読み書き権限をそのまま与える。anonキーはブラウザに配信されるので、
デプロイ先のURLを知っている人間は誰でも全データを読み書きできる状態になる。

公開する前に必ず、Supabase Auth のセッションを前提とした認証込みのRLSポリシーへ
差し替えること。それまではローカル開発・接続確認用に留める。

## データベース

スキーマは `supabase/migrations/` の手書きSQLで管理し、Supabase CLI で適用する。
Supabaseダッシュボード上で直接スキーマを変更しない。

```bash
supabase db push    # 未適用のマイグレーションをリモートへ適用
pnpm db:types       # スキーマからTypeScriptの型を再生成（lib/supabase/database.types.ts）
```

**マイグレーションのファイル名は `NNNN_説明.sql` の連番方式**（`0001_init_schema.sql` など）。
`supabase migration new` が既定で作る14桁タイムスタンプ形式は使っていない。新しく追加する
ときは既存の最大番号 + 1 を手で付け、番号が衝突・前後しないようにすること。

## テスト

```bash
pnpm test
```

DB関連のテスト（`tests/db/`, `tests/lib/`）は実際のSupabaseプロジェクトに接続します。
`.env.local` の設定が必要です。

この環境ではDockerが使えずローカルSupabaseを起動できないため、テストは**実際のリモート
プロジェクトに対して実行される**。テストが途中で落ちて後始末が走らなかった場合に備え、
`tests/global-setup.ts` がテスト全体の実行前に1回だけ走り、`TEST_` で始まる名前の残骸行を
まとめて削除する。テスト用データの名前には必ず `TEST_` 接頭辞を付けること。

## 旧実装

`legacy/webapp/` に旧実装（HTML/JS + localStorage）が残っています。仕様のリファレンスとして
`legacy/webapp/README.md` を参照してください。
