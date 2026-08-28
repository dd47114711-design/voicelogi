// 未実装の管理画面用のプレースホルダ。サイドバーのリンク切れを防ぐためだけに置く。
// 各画面の中身は個別のissueで実装する。
export function ComingSoon({ title }: { title: string }) {
  return (
    <main className="flex flex-col items-center gap-4 p-4 pt-24">
      <h1 className="text-3xl font-bold">{title}</h1>
      <p className="text-lg">この画面は準備中です。</p>
    </main>
  )
}
