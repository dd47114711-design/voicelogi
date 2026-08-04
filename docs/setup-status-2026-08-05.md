# セットアップ現況（2026-08-05 更新）

`docs/handoff-2026-08-03.md` の「次にやること」を、実機の状態に合わせて更新したもの。
**8/3 のメモより外部サービス側は進んでいる。** 食い違う場合はこちらを優先する。

## 確認済みの状態

| 項目 | 状態 |
| --- | --- |
| Git | ✅ 導入済み |
| VS Code / Zed | ✅ 両方導入済み（どちらか1つに絞る。当面は VS Code） |
| Claude Code | ✅ 動作確認済み（`D:\dev\.claude\settings.local.json` あり） |
| GitHub リポジトリ | ✅ `dd47114711-design/voicelogi`（公開） |
| Supabase プロジェクト | ✅ 作成済み「ボイスロジ」/ AWS ap-northeast-1 / Nano / 無料プラン |
| Vercel アカウント | ✅ 作成済み（team: `daishuke-k`） |
| Vercel ↔ GitHub 連携 | ❌ 未。`vercel.com/new` で GitHub App のインストールが必要 |
| Node.js / pnpm | ❓ 未確認（`node -v` で確認する） |
| GitHub CLI (`gh`) | ❓ 未確認（`gh --version` で確認する） |
| `CLAUDE.md` / `docs/` | ❌ 未コミット（untracked） |
| `dev` ブランチ | ❌ 未作成 |

## 要注意（8/3 メモに無かった問題）

- **GitHub のデフォルトブランチが `main` ではない。**
  現在 `claude/truck-dispatch-excel-q1rjzl` が既定になっている。
  `CLAUDE.md` のブランチ戦略（`main` = 本番）と矛盾するので、**リポジトリ設定でデフォルトを `main` に戻す。**
- **オープンな PR が1件残っている。** 中身を確認し、取り込むか閉じるかを決める。
- **リモートに `claude/*` ブランチが5本溜まっている。** 用済みのものは削除する。
- Supabase の接続情報（URL / anon key / DB パスワード）はまだリポジトリに入っていない。
  `.env.local` に置き、**`.gitignore` に必ず入れる。** service role キーはクライアントに出さない。

## 次にやること（この順番）

### 0. 環境の確認と不足分の導入

PowerShell で:

```powershell
node -v
pnpm -v
gh --version
```

「認識されていません」と出たものだけ入れる:

```powershell
winget install OpenJS.NodeJS.LTS
winget install GitHub.cli
```

**インストール後はターミナルを開き直す**（PATH 反映のため）。その後:

```powershell
corepack enable pnpm
gh auth login
```

`gh auth login` は対話式。`GitHub.com` → `HTTPS` → `Login with a web browser`。

### 1. リポジトリの掃除

- デフォルトブランチを `main` に戻す
- オープンな PR を確認して処理する
- 不要な `claude/*` リモートブランチを削除する

### 2. `CLAUDE.md` と `docs/` をコミット

`main` 直下での作業になる。ブランチを切るかは着手時に確認する。

### 3. `dev` ブランチを作る

`main` から切る。

### 4. Vercel と GitHub をつなぐ

`vercel.com/new` → GitHub App をインストール → `voicelogi` をインポート。
`main` = Production、`dev` = Preview に設定する。

### 5. 最初の issue を立てる

以降は issue 起点。想定している最初の数件は `docs/handoff-2026-08-03.md` を参照。

## まだ決めていないこと

`docs/handoff-2026-08-03.md` の「まだ決めていないこと」がそのまま有効。
特に **要件の移植範囲と優先順位** は着手時に必ず確認する。勝手に決めない。
