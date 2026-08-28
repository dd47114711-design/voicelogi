'use client'

type MenuToggleButtonProps = {
  onClick: () => void
}

export function MenuToggleButton({ onClick }: MenuToggleButtonProps) {
  return (
    <button
      type="button"
      aria-label="メニューを開く"
      onClick={onClick}
      // 盤面のどのページからでも同じ位置にあるよう、メインエリアの左上に固定する。
      className="fixed top-3 left-3 z-40 flex size-14 flex-col items-center justify-center gap-1.5 rounded-lg border border-black/10 bg-background hover:bg-black/10 dark:border-white/15 dark:hover:bg-white/20"
    >
      <span className="block h-0.5 w-7 bg-foreground" />
      <span className="block h-0.5 w-7 bg-foreground" />
      <span className="block h-0.5 w-7 bg-foreground" />
    </button>
  )
}
