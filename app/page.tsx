import { Suspense } from 'react'
import { StaffCount } from '@/components/staff-count'

// この画面はDBへの生の接続確認が目的なので、ビルド時に静的生成させない。
// （ビルド時点では環境変数が未設定なこともある）
export const dynamic = 'force-dynamic'

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
