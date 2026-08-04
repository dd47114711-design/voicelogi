# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## 言語

**応答・思考の要約・コミットメッセージ・PR・issue・コード内コメント・UI文言は、常に日本語で書く。** 英語で返さない。

## このリポジトリの現状

配車・出退勤ボードを **Next.js + Supabase で作り直している最中**。現時点でリポジトリにあるのは旧実装のみで、新アプリはまだ存在しない。

- `webapp/` … 旧実装（素の HTML/CSS/JS + localStorage）。**動く仕様書として扱う。** 特に `webapp/README.md` に、実運用で確定した画面仕様・操作フロー・集計ルールが日本語で詳細に書かれている。新実装の要件はここから起こす。
- `scripts/`, `output/` … さらに前の Excel 版の名残。参照価値は低い。
- 新アプリは**リポジトリ直下**に作る。着手時に `webapp/` と `scripts/` と `output/` を `legacy/` へ退避する（未実施 — 最初の issue で行う）。

## 技術スタック

npm レジストリで確認済みの最新版（2026-08-03 時点）を使う。着手時に再確認すること。

| 領域 | 採用 | 備考 |
| --- | --- | --- |
| フレームワーク | Next.js 16（最新は 16.2.12） | App Router のみ。Pages Router は使わない |
| UI | React 19（最新は 19.2.8） | Server Components 前提 |
| 言語 | TypeScript | `strict: true`。`any` を使わない |
| スタイル | Tailwind CSS | |
| コンポーネント | shadcn/ui | 後述の方針を参照 |
| DB | Supabase Postgres | |
| DB アクセス | Drizzle ORM | スキーマ・マイグレーションを TypeScript でコード管理 |
| 認証・Realtime | supabase-js | Supabase Auth + RLS、Supabase Realtime |
| テスト | Vitest（単体） / Playwright（E2E） | |
| パッケージマネージャ | pnpm | |
| デプロイ | Vercel | `main` = 本番 |

### 着手前に解消が必要な前提

この端末に以下が入っていない。最初の issue の前に導入すること（`winget` は利用可）。

- **Node.js（および pnpm）** — 未インストール。`winget install OpenJS.NodeJS.LTS` → `corepack enable pnpm`
- **GitHub CLI (`gh`)** — 未インストール。issue 運用に必須。`winget install GitHub.cli` → `gh auth login`

## 開発フロー

### issue 起点

**すべての作業は GitHub issue から始める。** issue が無い依頼を受けたら、まず issue を立てるところから始める。リポジトリは `dd47114711-design/voicelogi`。

```powershell
gh issue list
gh issue view <番号>
gh issue create --title "..." --body "..."
```

### ブランチ戦略

```
main（本番 / Vercel Production）
 └── dev（統合ブランチ / Vercel Preview）
      └── feature/<issue番号>-<短い説明>
```

- 作業ブランチは必ず `dev` から切り、`dev` へ PR を出す。
- `main` へは `dev` からのみマージする。`main` へ直接 push・直接 PR しない。
- `dev` ブランチは未作成。最初に `main` から作る。

### worktree + superpowers

**issue ごとに専用の git worktree を作って作業する。** 作業ディレクトリを汚さず、複数 issue を並行させるため。

作業の進め方は superpowers スキルに従う。特に:

- 機能追加・変更の前に `superpowers:brainstorming` で設計を固め、`superpowers:writing-plans` で計画を書く
- worktree の用意は `superpowers:using-git-worktrees`
- 実装は `superpowers:test-driven-development`（テストを先に書く）
- 完了判定の前に `superpowers:verification-before-completion`（コマンドを実行し出力を確認してから「できた」と言う）
- バグ調査は `superpowers:systematic-debugging`
- ブランチの統合判断は `superpowers:finishing-a-development-branch`

## アーキテクチャ規約

ここに書かれた項目は好みではなく**制約**。逸れる場合は先に相談する。

### ルーティングとレンダリング

- **App Router のみ。** `app/` 配下。Pages Router・`getServerSideProps` 系は使わない。
- **既定は Server Component。** `"use client"` は、実際にイベントハンドラ・状態・ブラウザ API が要る葉のコンポーネントにだけ付ける。クライアント境界はできる限り木の下側へ押し下げる。
- Next.js 16 では `params` / `searchParams` が Promise。**Next.js 14/15 時代の書き方を記憶で書かない。** 迷ったらインストール済みバージョンの公式ドキュメントを確認する。

### ストリーミングとデータ取得（最重要）

- **DB フェッチ1単位 = 1コンポーネント = 1 Suspense 境界。** データを必要とするコンポーネント自身がそのデータを取得し、呼び出し側が `<Suspense fallback={...}>` で包む。取得結果を親から props でバケツリレーしない。
- **`Promise.all` を使わない。** 複数フェッチを束ねると最も遅い1本に全体が引きずられ、ストリーミングの意味が消える。並列化は React のコンポーネント境界に任せる（独立した Suspense 境界のフェッチは自然に並列に走る）。
- 上記の結果として、画面は「速く返るブロックから順に描画される」。ページ全体が揃うまで待つローディングを作らない。
- **コンポーネントは最小単位に割る。** 1ファイル1責務。ファイルが大きくなってきたら、それは分割の合図。

### UI / UX

- Tailwind + shadcn/ui。
- **shadcn のコンポーネントはそのまま使わず、`components/ui/` に取り込んだうえで自前のコンポーネントとして育てる。** 素の shadcn をアプリ全体に直接散らさない。プロジェクト固有の意味を持つラッパー（例: 名前札、ダンプ札、現場グループ）を作り、画面はそれを組み合わせて書く。
- 現場のタッチモニター運用が前提。**新規の名称入力以外はタップだけで完結させる。** プルダウンを使わず、大きなボタン・チップ・カレンダー・並べ替えボタンで代替する（旧実装と同じ方針）。

### データベース

- スキーマは Drizzle でコード定義し、マイグレーションを git 管理する。Supabase ダッシュボードで手動変更しない。
- **RLS を有効にする。** Supabase Auth のセッションを前提にポリシーを書く。service role キーをクライアントに露出させない。
- 複数端末で同じ盤面を見るため、**Supabase Realtime で状態を同期する。** 「操作した端末だけ最新」にしない。

### テスト

- ドメインロジック（配車の重複割当防止、出退勤の集計など）は Vitest で単体テスト。実装より先にテストを書く。
- 主要な操作フロー（配車登録、出退勤打刻、CSV 出力）は Playwright で E2E。

## 引き継ぐべきドメインの不変条件

旧実装が実運用の中で獲得したルール。新実装でも**必ず維持する**。詳細な背景は `webapp/README.md` と `webapp/app.js` のコメントにある。

- **現場名で人・車両をグルーピングしない。** 同じ現場に複数の「配置枠」が同時に存在しうる（フェアロード①②③）。必ず配置枠の ID を介して分類する。
- **「通常ダンプ」と「当日の乗車ダンプ」は別データ。** 当日だけ別の車両に乗せても、その人の通常ダンプ設定は変わらない。
- **1人・1台が同時に2つの配置枠に入らない。** 既に他所で使用中の運転手・車両を選んだ場合は、移動確認を挟んでから元の割当を解除する。
- **出退勤の打刻は配置を動かさない。** 退勤しても配置枠に残ったまま、札の色が白→赤に変わるだけ。「休み」に入るのは、そもそもどの配置枠にも居ない人だけ。
- **出退勤はイベントログを追記するだけ。上書き・削除しない。** 出勤時刻・退勤時刻・勤務時間・残業は、毎回イベントから再計算する。集計結果を保存しない。
- **部門横断がある。** 土木の作業員が運輸のダンプに乗る日がある。盤面の表示先は「当日の配置枠の部門」で決まるが、出退勤 CSV の所属は常に本人の基本所属。
- **原則、削除しない。** 従業員は退職扱い、現場は使用停止、配置枠は終了、で状態を持つ。過去の記録は残す。
- 札の文字は縦書き。出勤=白 / 退勤=赤 は確定仕様。
