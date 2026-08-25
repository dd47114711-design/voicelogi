# Supabase接続とDB初期化 実装計画

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 新実装（Next.js + Supabase）の起点として、旧実装をlegacyへ退避し、Next.js雛形を作り、Supabase Postgres上に実テーブルを作成し、Server Action経由で疎通確認する。

**Architecture:** ORMを使わず、Next.js Server Actions内で`@supabase/supabase-js`を直接呼び出す構成。スキーマはSupabase CLIのSQLマイグレーション（`supabase/migrations/*.sql`）でgit管理し、`supabase db push`でリモートのSupabaseプロジェクト「ボイスロジ」に適用する。

**Tech Stack:** Next.js 16 (App Router) / React 19 / TypeScript (strict) / Tailwind CSS / pnpm / `@supabase/supabase-js` / Supabase CLI / Vitest

**Spec:** `docs/superpowers/specs/2026-08-25-supabase-db-setup-design.md`

## Global Constraints

- ORMは使わない。DBアクセスはServer Actions内で`supabase-js`を直接使用する（Drizzleは使わない）。
- スキーマ・マイグレーションは`supabase/migrations/*.sql`でgit管理する。Supabaseダッシュボードでの手動スキーマ変更はしない。
- 全テーブルでRLSを有効化し、`delete`ポリシーは作らない（「原則削除しない」というドメイン不変条件を反映）。
- UIはshadcn/uiを導入せず、素のTailwindで最小限の疎通確認画面のみ作る。
- TypeScriptは`strict: true`。`any`を使わない。
- パッケージマネージャはpnpm。
- Server Component既定、DBフェッチを行うコンポーネント自身がデータ取得し、呼び出し側は`<Suspense>`で包む（`Promise.all`で複数フェッチを束ねない）。
- 音声配車入力用テーブル、Supabase Auth、Realtime同期は今回のスコープ外（別issue）。
- テストで作成するfixtureデータ（`TEST_`プレフィックス）は、業務データではないため`afterAll`で削除してよい（「原則削除しない」はドメイン上の実データに対する制約であり、テストfixtureには適用しない）。

---

## 実行前の注意（Task 1について）

Task 1（Supabase CLIログイン）は**ブラウザでの対話的な認証操作**を伴うため、サブエージェントに委譲できない。メインセッション（人間が同席している対話）で実行すること。Task 1完了後、`.env.local`に接続情報一式が揃っていることを他タスクの前提とする。

---

### Task 1: Supabase CLIでログインし、プロジェクト「ボイスロジ」の接続情報を取得する

**Files:**
- Create: `.env.local`（gitignore対象、コミットしない）
- Create: `.env.example`（値を空にしたテンプレート、コミットする）

**Interfaces:**
- Produces: 環境変数 `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`（以降の全タスクが利用）

- [ ] **Step 1: Supabase CLIにログインする**

リポジトリルート（`D:\dev\voicelogi`）で実行:

```bash
npx supabase login
```

ブラウザが開くので認可する。CLIが開けない・ブラウザ連携できない場合は、Supabaseダッシュボードの
Account > Access Tokens でトークンを発行し、`npx supabase login --token <発行したトークン>` を使う。

- [ ] **Step 2: プロジェクト「ボイスロジ」のproject refを確認する**

```bash
npx supabase projects list
```

出力の中から名前が「ボイスロジ」の行の `REFERENCE ID` を控える（以降 `<project-ref>` と表記）。

- [ ] **Step 3: Supabaseプロジェクト設定から接続情報を取得する**

Supabaseダッシュボード > 対象プロジェクト > Project Settings > API を開き、以下を控える:
- `Project URL`
- `anon public` キー
- `service_role` キー（**絶対にクライアントに露出させない。サーバー専用**）

- [ ] **Step 4: `.env.local` を作成する**

```
NEXT_PUBLIC_SUPABASE_URL=<Project URLをそのまま貼る>
NEXT_PUBLIC_SUPABASE_ANON_KEY=<anon publicキーをそのまま貼る>
SUPABASE_SERVICE_ROLE_KEY=<service_roleキーをそのまま貼る>
SUPABASE_PROJECT_REF=<project-ref>
```

- [ ] **Step 5: `.env.example` を作成する（値は空でキー名だけ）**

```
NEXT_PUBLIC_SUPABASE_URL=
NEXT_PUBLIC_SUPABASE_ANON_KEY=
SUPABASE_SERVICE_ROLE_KEY=
SUPABASE_PROJECT_REF=
```

- [ ] **Step 6: 動作確認**

```bash
npx supabase projects list
```

Expected: エラーなく一覧が表示され、「ボイスロジ」が含まれる。

- [ ] **Step 7: `.env.example` だけをコミット**

```bash
git add .env.example
git commit -m "Supabaseプロジェクトの接続情報テンプレートを追加"
```

`.env.local` は次のTaskで作る`.gitignore`に含まれるまでは絶対に`git add`しないこと。

---

### Task 2: `webapp/` `scripts/` `output/` を `legacy/` へ退避する

**Files:**
- Move: `webapp/` → `legacy/webapp/`
- Move: `scripts/` → `legacy/scripts/`
- Move: `output/` → `legacy/output/`

**Interfaces:**
- Consumes: なし
- Produces: なし（後続タスクはリポジトリ直下が新アプリ用に空くことに依存する）

- [ ] **Step 1: legacyディレクトリを作って中身を移動する**

```bash
mkdir legacy
git mv webapp legacy/webapp
git mv scripts legacy/scripts
git mv output legacy/output
```

- [ ] **Step 2: 移動できたことを確認する**

```bash
git status
ls legacy
```

Expected: `legacy/webapp` `legacy/scripts` `legacy/output` が存在し、ルート直下に
`webapp` `scripts` `output` が無いこと。

- [ ] **Step 3: コミット**

```bash
git commit -m "旧実装(webapp/scripts/output)をlegacy/へ退避"
```

---

### Task 3: Next.js雛形を作成する（TypeScript / Tailwind / pnpm）

**Files:**
- Create: `package.json`, `tsconfig.json`, `next.config.ts`, `postcss.config.mjs`, `app/layout.tsx`, `app/page.tsx`, `app/globals.css`, `.gitignore`, `.eslintrc.json`（またはNext標準のeslint設定ファイル）

**Interfaces:**
- Consumes: なし
- Produces: `app/` 配下のApp Router構成、`@/*` importエイリアス（以降の全タスクが利用）

- [ ] **Step 1: 一時ディレクトリにNext.jsを生成する**

リポジトリのルートに直接生成すると既存の`CLAUDE.md`や`docs/`と衝突する可能性があるため、
一時ディレクトリに生成してから中身だけ移動する。

```bash
cd ..
pnpm create next-app@latest voicelogi-scaffold-tmp --typescript --tailwind --app --eslint --src-dir=false --import-alias "@/*" --use-pnpm
```

対話プロンプトが出た場合はすべてデフォルト（Enter）でよい。生成後のNext.jsのバージョンが
CLAUDE.md記載の「16.2.12」と異なる場合は、`cd voicelogi-scaffold-tmp && pnpm info next version`
で最新版を確認し、大きく離れていれば一旦その旨を報告して判断を仰ぐ。

- [ ] **Step 2: 生成物をリポジトリ直下へ移動する**

```bash
cd voicelogi-scaffold-tmp
mv package.json tsconfig.json next.config.ts postcss.config.mjs .gitignore ../voicelogi/
mv .eslintrc.json ../voicelogi/ 2>/dev/null || mv eslint.config.mjs ../voicelogi/
mv app ../voicelogi/
mv public ../voicelogi/ 2>/dev/null || true
cd ..
rm -rf voicelogi-scaffold-tmp
cd voicelogi
```

- [ ] **Step 3: 依存関係をインストールする**

```bash
pnpm install
```

Expected: エラーなく完了し、`node_modules/` と `pnpm-lock.yaml` が生成される。

- [ ] **Step 4: 開発サーバーが起動することを確認する**

```bash
pnpm dev
```

Expected: `http://localhost:3000` でNext.jsの初期ページが表示される。確認後 `Ctrl+C` で停止。

- [ ] **Step 5: `tsconfig.json` の `strict` が `true` であることを確認する**

`tsconfig.json` の `compilerOptions.strict` が `true` になっていることを目視確認する
（create-next-appのTypeScriptテンプレートは既定で`true`のはずだが、念のため確認する）。
`false`になっていた場合は`true`に修正する。

- [ ] **Step 6: コミット**

```bash
git add package.json tsconfig.json next.config.ts postcss.config.mjs .gitignore app public pnpm-lock.yaml
git add .eslintrc.json 2>/dev/null || git add eslint.config.mjs
git commit -m "Next.js 16 + TypeScript + Tailwindの雛形を追加"
```

---

### Task 4: Vitest環境をセットアップする

**Files:**
- Create: `vitest.config.ts`
- Create: `tests/setup.ts`
- Modify: `package.json`（scriptsに`test`を追加）

**Interfaces:**
- Consumes: `tsconfig.json` の `@/*` エイリアス（Task 3で作成）
- Produces: `pnpm test` コマンド、`tests/` 配下のテストが `.env.local` を読み込める状態

- [ ] **Step 1: 依存パッケージを追加する**

```bash
pnpm add -D vitest dotenv
```

- [ ] **Step 2: `tests/setup.ts` を作成する**

```typescript
import { config } from 'dotenv'

config({ path: '.env.local' })
```

- [ ] **Step 3: `vitest.config.ts` を作成する**

```typescript
import path from 'node:path'
import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    environment: 'node',
    setupFiles: ['./tests/setup.ts'],
  },
  resolve: {
    alias: {
      '@': path.resolve(__dirname, '.'),
    },
  },
})
```

- [ ] **Step 4: `package.json` の `scripts` に `test` を追加する**

```json
{
  "scripts": {
    "test": "vitest run"
  }
}
```

（既存の `dev` / `build` / `start` / `lint` スクリプトは残したまま追記する）

- [ ] **Step 5: ダミーテストで疎通確認する**

`tests/sanity.test.ts` を一時的に作成:

```typescript
import { describe, expect, it } from 'vitest'

describe('vitestの疎通確認', () => {
  it('1 + 1 は 2', () => {
    expect(1 + 1).toBe(2)
  })
})
```

```bash
pnpm test
```

Expected: PASS。確認後 `tests/sanity.test.ts` を削除する。

- [ ] **Step 6: コミット**

```bash
git add vitest.config.ts tests/setup.ts package.json pnpm-lock.yaml
git commit -m "Vitestのテスト環境を追加"
```

---

### Task 5: Supabaseクライアントヘルパーを作成する

**Files:**
- Create: `lib/supabase/server.ts`
- Test: `tests/lib/supabase-server.test.ts`

**Interfaces:**
- Consumes: 環境変数 `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`（Task 1）
- Produces: `createServerSupabaseClient(): SupabaseClient`（Task 8が利用）

- [ ] **Step 1: 依存パッケージを追加する**

```bash
pnpm add @supabase/supabase-js
```

- [ ] **Step 2: 失敗するテストを書く**

`tests/lib/supabase-server.test.ts`:

```typescript
import { describe, expect, it } from 'vitest'
import { createServerSupabaseClient } from '@/lib/supabase/server'

describe('createServerSupabaseClient', () => {
  it('SupabaseClientを生成できる', () => {
    const client = createServerSupabaseClient()
    expect(client).toBeDefined()
    expect(typeof client.from).toBe('function')
  })

  it('環境変数が無い場合はエラーを投げる', () => {
    const originalUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
    delete process.env.NEXT_PUBLIC_SUPABASE_URL
    expect(() => createServerSupabaseClient()).toThrow()
    process.env.NEXT_PUBLIC_SUPABASE_URL = originalUrl
  })
})
```

- [ ] **Step 3: テストを実行して失敗を確認する**

```bash
pnpm test tests/lib/supabase-server.test.ts
```

Expected: FAIL（`lib/supabase/server.ts` が存在しないためモジュール解決エラー）。

- [ ] **Step 4: 実装する**

`lib/supabase/server.ts`:

```typescript
import { createClient, type SupabaseClient } from '@supabase/supabase-js'

export function createServerSupabaseClient(): SupabaseClient {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY

  if (!url || !anonKey) {
    throw new Error(
      'Supabase接続情報(NEXT_PUBLIC_SUPABASE_URL / NEXT_PUBLIC_SUPABASE_ANON_KEY)が設定されていません',
    )
  }

  return createClient(url, anonKey)
}
```

- [ ] **Step 5: テストを実行して成功を確認する**

```bash
pnpm test tests/lib/supabase-server.test.ts
```

Expected: PASS。

- [ ] **Step 6: コミット**

```bash
git add lib/supabase/server.ts tests/lib/supabase-server.test.ts package.json pnpm-lock.yaml
git commit -m "Supabaseサーバークライアントのヘルパーを追加"
```

---

### Task 6: スキーマのmigrationを作成し、リモートDBへ適用する

**Files:**
- Create: `supabase/config.toml`（`supabase init`で自動生成）
- Create: `supabase/migrations/0001_init_schema.sql`
- Test: `tests/db/staff-placements.test.ts`

**Interfaces:**
- Consumes: `SUPABASE_PROJECT_REF`, `SUPABASE_SERVICE_ROLE_KEY`（Task 1）
- Produces: リモートSupabaseプロジェクトに実テーブル一式（`staff`, `vehicles`, `sites`, `placement_slots`, `staff_placements`, `vehicle_placements`, `attendance_events`）

- [ ] **Step 1: 失敗するテストを先に書く**

`tests/db/staff-placements.test.ts`:

```typescript
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { createClient, type SupabaseClient } from '@supabase/supabase-js'

describe('staff_placements の一意制約', () => {
  let adminClient: SupabaseClient
  let staffId: string

  beforeAll(async () => {
    const url = process.env.NEXT_PUBLIC_SUPABASE_URL as string
    const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY as string
    adminClient = createClient(url, serviceRoleKey)

    const { data, error } = await adminClient
      .from('staff')
      .insert({ name: 'TEST_一意制約確認用', department: '運輸' })
      .select('id')
      .single()

    if (error || !data) {
      throw new Error(`テスト用staffの作成に失敗しました: ${error?.message}`)
    }
    staffId = data.id

    const { error: placementError } = await adminClient
      .from('staff_placements')
      .insert({ staff_id: staffId })

    if (placementError) {
      throw new Error(`テスト用staff_placementsの作成に失敗しました: ${placementError.message}`)
    }
  })

  afterAll(async () => {
    await adminClient.from('staff_placements').delete().eq('staff_id', staffId)
    await adminClient.from('staff').delete().eq('id', staffId)
  })

  it('同じstaff_idを2回登録しようとするとエラーになる', async () => {
    const { error } = await adminClient.from('staff_placements').insert({ staff_id: staffId })

    expect(error).not.toBeNull()
    expect(error?.code).toBe('23505')
  })
})
```

- [ ] **Step 2: テストを実行して失敗を確認する**

```bash
pnpm test tests/db/staff-placements.test.ts
```

Expected: FAIL（`relation "staff" does not exist` などのエラー。テーブルがまだ無いため）。

- [ ] **Step 3: `supabase init` でローカル構成を作る**

```bash
npx supabase init
```

- [ ] **Step 4: プロジェクトをリンクする**

```bash
npx supabase link --project-ref <Task 1で控えたSUPABASE_PROJECT_REF>
```

DBパスワードを聞かれた場合は、Supabaseダッシュボード > Project Settings > Database の
パスワードを入力する（不明な場合はダッシュボードでリセットして控える）。

- [ ] **Step 5: migrationファイルを作成する**

`supabase/migrations/0001_init_schema.sql`:

```sql
create extension if not exists "pgcrypto";

create table staff (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  department text not null check (department in ('土木', '運輸')),
  normal_vehicle_id uuid,
  display_order integer not null default 0,
  active boolean not null default true,
  retired_at timestamptz,
  created_at timestamptz not null default now()
);

create table vehicles (
  id uuid primary key default gen_random_uuid(),
  display_name text not null,
  vehicle_number text not null,
  vehicle_type text not null,
  status text not null default '使用可能' check (status in ('使用可能', '整備', '車検', '故障', '使用停止')),
  display_order integer not null default 0,
  active boolean not null default true,
  created_at timestamptz not null default now()
);

alter table staff
  add constraint staff_normal_vehicle_id_fkey
  foreign key (normal_vehicle_id) references vehicles(id);

create table sites (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  category text not null check (category in ('土木', '運輸', '共通')),
  active boolean not null default true,
  display_order integer not null default 0,
  usage_count integer not null default 0,
  created_at timestamptz not null default now()
);

create table placement_slots (
  id uuid primary key default gen_random_uuid(),
  site_id uuid not null references sites(id),
  opened_at timestamptz not null default now(),
  ended_at timestamptz
);

create table staff_placements (
  staff_id uuid primary key references staff(id),
  slot_id uuid references placement_slots(id),
  assigned_vehicle_id uuid references vehicles(id),
  updated_at timestamptz not null default now()
);

create table vehicle_placements (
  vehicle_id uuid primary key references vehicles(id),
  slot_id uuid references placement_slots(id),
  updated_at timestamptz not null default now()
);

create table attendance_events (
  id uuid primary key default gen_random_uuid(),
  staff_id uuid not null references staff(id),
  action text not null check (action in ('clockIn', 'clockOut')),
  occurred_at timestamptz not null,
  created_at timestamptz not null default now()
);
```

- [ ] **Step 6: リモートDBへ適用する**

```bash
npx supabase db push
```

Expected: エラーなく完了する。Supabaseダッシュボード > Table Editor で7テーブルが
作成されていることを目視確認する。

- [ ] **Step 7: テストを実行して成功を確認する**

```bash
pnpm test tests/db/staff-placements.test.ts
```

Expected: PASS。

- [ ] **Step 8: コミット**

```bash
git add supabase/config.toml supabase/migrations/0001_init_schema.sql tests/db/staff-placements.test.ts
git commit -m "スキーマの初期migrationを追加し、Supabaseへ適用"
```

`.gitignore` に `supabase/.temp` 等のCLI作業ファイルが含まれていることを確認する
（`supabase init`が自動でNext.js用の`.gitignore`に追記しない場合は、以下を手動で追記する）:

```
# Supabase CLI
supabase/.temp
```

---

### Task 7: 全テーブルにRLSを有効化し、暫定の全許可ポリシーを設定する

**Files:**
- Create: `supabase/migrations/0002_rls_permissive.sql`
- Test: `tests/db/rls-policy.test.ts`

**Interfaces:**
- Consumes: Task 6で作成した7テーブル
- Produces: 匿名キー（anon）で全テーブルにselect/insert/updateできる状態（deleteは不可）

- [ ] **Step 1: 失敗するテストを先に書く**

`tests/db/rls-policy.test.ts`:

```typescript
import { afterAll, describe, expect, it } from 'vitest'
import { createClient, type SupabaseClient } from '@supabase/supabase-js'

describe('RLS: anonキーでのアクセス', () => {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL as string
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY as string
  const anonClient: SupabaseClient = createClient(url, anonKey)

  let insertedId: string | undefined

  afterAll(async () => {
    if (!insertedId) return
    const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY as string
    const adminClient = createClient(url, serviceRoleKey)
    await adminClient.from('sites').delete().eq('id', insertedId)
  })

  it('anonキーでsitesをselectできる', async () => {
    const { error } = await anonClient.from('sites').select('id').limit(1)
    expect(error).toBeNull()
  })

  it('anonキーでsitesにinsertできる', async () => {
    const { data, error } = await anonClient
      .from('sites')
      .insert({ name: 'TEST_RLS確認用現場', category: '運輸' })
      .select('id')
      .single()

    expect(error).toBeNull()
    expect(data?.id).toBeDefined()
    insertedId = data?.id
  })

  it('anonキーでsitesをdeleteできない', async () => {
    if (!insertedId) throw new Error('insertテストが先に成功している必要があります')
    const { error, count } = await anonClient
      .from('sites')
      .delete({ count: 'exact' })
      .eq('id', insertedId)

    expect(error === null && count === 0).toBe(true)
  })
})
```

- [ ] **Step 2: テストを実行して失敗を確認する**

```bash
pnpm test tests/db/rls-policy.test.ts
```

Expected: FAIL（RLSが無効なため、少なくとも「deleteできない」の期待に反してdeleteが
成功してしまう、または他のアサーションで失敗する）。

- [ ] **Step 3: migrationファイルを作成する**

`supabase/migrations/0002_rls_permissive.sql`:

```sql
alter table staff enable row level security;
alter table vehicles enable row level security;
alter table sites enable row level security;
alter table placement_slots enable row level security;
alter table staff_placements enable row level security;
alter table vehicle_placements enable row level security;
alter table attendance_events enable row level security;

create policy "staff_select_all" on staff for select using (true);
create policy "staff_insert_all" on staff for insert with check (true);
create policy "staff_update_all" on staff for update using (true) with check (true);

create policy "vehicles_select_all" on vehicles for select using (true);
create policy "vehicles_insert_all" on vehicles for insert with check (true);
create policy "vehicles_update_all" on vehicles for update using (true) with check (true);

create policy "sites_select_all" on sites for select using (true);
create policy "sites_insert_all" on sites for insert with check (true);
create policy "sites_update_all" on sites for update using (true) with check (true);

create policy "placement_slots_select_all" on placement_slots for select using (true);
create policy "placement_slots_insert_all" on placement_slots for insert with check (true);
create policy "placement_slots_update_all" on placement_slots for update using (true) with check (true);

create policy "staff_placements_select_all" on staff_placements for select using (true);
create policy "staff_placements_insert_all" on staff_placements for insert with check (true);
create policy "staff_placements_update_all" on staff_placements for update using (true) with check (true);

create policy "vehicle_placements_select_all" on vehicle_placements for select using (true);
create policy "vehicle_placements_insert_all" on vehicle_placements for insert with check (true);
create policy "vehicle_placements_update_all" on vehicle_placements for update using (true) with check (true);

create policy "attendance_events_select_all" on attendance_events for select using (true);
create policy "attendance_events_insert_all" on attendance_events for insert with check (true);
```

- [ ] **Step 4: リモートDBへ適用する**

```bash
npx supabase db push
```

- [ ] **Step 5: テストを実行して成功を確認する**

```bash
pnpm test tests/db/rls-policy.test.ts
```

Expected: PASS。

- [ ] **Step 6: コミット**

```bash
git add supabase/migrations/0002_rls_permissive.sql tests/db/rls-policy.test.ts
git commit -m "全テーブルにRLSを有効化し、暫定の全許可ポリシーを追加"
```

---

### Task 8: 接続確認用のServer Actionと画面を実装する

**Files:**
- Create: `app/actions/staff.ts`
- Create: `components/staff-count.tsx`
- Modify: `app/page.tsx`
- Test: `tests/actions/staff.test.ts`

**Interfaces:**
- Consumes: `createServerSupabaseClient()`（Task 5）
- Produces: `getStaffCount(): Promise<number>`（`components/staff-count.tsx`が利用）

- [ ] **Step 1: 失敗するテストを先に書く**

`tests/actions/staff.test.ts`:

```typescript
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { createClient, type SupabaseClient } from '@supabase/supabase-js'
import { getStaffCount } from '@/app/actions/staff'

describe('getStaffCount', () => {
  let adminClient: SupabaseClient
  let staffId: string

  beforeAll(async () => {
    const url = process.env.NEXT_PUBLIC_SUPABASE_URL as string
    const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY as string
    adminClient = createClient(url, serviceRoleKey)

    const { data, error } = await adminClient
      .from('staff')
      .insert({ name: 'TEST_getStaffCount確認用', department: '土木' })
      .select('id')
      .single()

    if (error || !data) {
      throw new Error(`テスト用staffの作成に失敗しました: ${error?.message}`)
    }
    staffId = data.id
  })

  afterAll(async () => {
    await adminClient.from('staff').delete().eq('id', staffId)
  })

  it('登録済みのstaff件数を1件以上返す', async () => {
    const count = await getStaffCount()
    expect(count).toBeGreaterThanOrEqual(1)
  })
})
```

- [ ] **Step 2: テストを実行して失敗を確認する**

```bash
pnpm test tests/actions/staff.test.ts
```

Expected: FAIL（`app/actions/staff.ts` が存在しないためモジュール解決エラー）。

- [ ] **Step 3: Server Actionを実装する**

`app/actions/staff.ts`:

```typescript
'use server'

import { createServerSupabaseClient } from '@/lib/supabase/server'

export async function getStaffCount(): Promise<number> {
  const supabase = createServerSupabaseClient()
  const { count, error } = await supabase
    .from('staff')
    .select('*', { count: 'exact', head: true })

  if (error) {
    throw new Error(`staff件数の取得に失敗しました: ${error.message}`)
  }

  return count ?? 0
}
```

- [ ] **Step 4: テストを実行して成功を確認する**

```bash
pnpm test tests/actions/staff.test.ts
```

Expected: PASS。

- [ ] **Step 5: 表示用コンポーネントを作成する**

`components/staff-count.tsx`:

```tsx
import { getStaffCount } from '@/app/actions/staff'

export async function StaffCount() {
  const count = await getStaffCount()
  return <p className="text-lg">staffテーブルの件数: {count}</p>
}
```

- [ ] **Step 6: `app/page.tsx` を書き換える**

`app/page.tsx`:

```tsx
import { Suspense } from 'react'
import { StaffCount } from '@/components/staff-count'

export default function Home() {
  return (
    <main className="p-8">
      <h1 className="text-2xl font-bold mb-4">VoiceLogi 接続確認</h1>
      <Suspense fallback={<p>読み込み中...</p>}>
        <StaffCount />
      </Suspense>
    </main>
  )
}
```

- [ ] **Step 7: 開発サーバーで目視確認する**

```bash
pnpm dev
```

`http://localhost:3000` を開き、「staffテーブルの件数: 0」（またはテスト残留があれば
それ以上の数字）が表示されることを確認する。確認後 `Ctrl+C` で停止。

- [ ] **Step 8: コミット**

```bash
git add app/actions/staff.ts components/staff-count.tsx app/page.tsx tests/actions/staff.test.ts
git commit -m "staff件数を表示する接続確認用Server Actionと画面を追加"
```

---

### Task 9: 仕上げ（README更新・最終確認）

**Files:**
- Create: `README.md`（リポジトリ直下、新実装用）

**Interfaces:**
- Consumes: なし
- Produces: なし

- [ ] **Step 1: リポジトリ直下に `README.md` を作成する**

```markdown
# voicelogi

配車・出退勤ボードの新実装（Next.js + Supabase）。

## セットアップ

\`\`\`bash
pnpm install
cp .env.example .env.local
# .env.local にSupabaseの接続情報を設定する
pnpm dev
\`\`\`

## テスト

\`\`\`bash
pnpm test
\`\`\`

DB関連のテスト（`tests/db/`, `tests/actions/`）は実際のSupabaseプロジェクトに接続します。
`.env.local` の設定が必要です。

## 旧実装

`legacy/webapp/` に旧実装（HTML/JS + localStorage）が残っています。仕様のリファレンスとして
`legacy/webapp/README.md` を参照してください。
```

- [ ] **Step 2: 全体を通しで実行して最終確認する**

```bash
pnpm install
pnpm lint
pnpm test
pnpm build
```

Expected: すべてエラーなく完了する。

- [ ] **Step 3: コミット**

```bash
git add README.md
git commit -m "新実装のセットアップ手順をREADMEに追加"
```

---

## 完了条件

- [ ] `legacy/` に旧実装一式が退避されている
- [ ] リポジトリ直下でNext.jsアプリが `pnpm dev` / `pnpm build` できる
- [ ] Supabaseプロジェクト「ボイスロジ」に7テーブルが作成され、全テーブルでRLSが有効
- [ ] `pnpm test` が全てPASSする（一意制約テスト・RLSテスト・Server Actionテストを含む）
- [ ] `http://localhost:3000` でstaff件数が表示される
