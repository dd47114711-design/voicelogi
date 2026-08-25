# voicelogi

配車・出退勤ボードの新実装（Next.js + Supabase）。

## セットアップ

```bash
pnpm install
cp .env.example .env.local
# .env.local にSupabaseの接続情報を設定する
pnpm dev
```

## テスト

```bash
pnpm test
```

DB関連のテスト（`tests/db/`, `tests/actions/`）は実際のSupabaseプロジェクトに接続します。
`.env.local` の設定が必要です。

## 旧実装

`legacy/webapp/` に旧実装（HTML/JS + localStorage）が残っています。仕様のリファレンスとして
`legacy/webapp/README.md` を参照してください。
