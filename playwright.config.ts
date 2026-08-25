import { config } from 'dotenv'
import { defineConfig } from '@playwright/test'

// vitestのtests/setup.tsと同様、.env.localの接続情報をテストプロセスにも読み込む。
config({ path: '.env.local' })

export default defineConfig({
  testDir: './tests/e2e',
  timeout: 30_000,
  webServer: {
    // ポート3000は他のworktree（本体チェックアウト）のdevサーバーが使用中のことがあるため、
    // このE2E専用に別ポートを割り当てて衝突を避ける。
    command: 'pnpm exec next dev --port 3100',
    url: 'http://localhost:3100',
    reuseExistingServer: !process.env.CI,
    timeout: 60_000,
  },
  use: {
    baseURL: 'http://localhost:3100',
  },
})
