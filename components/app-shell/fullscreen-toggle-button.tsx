'use client'

import { useSyncExternalStore } from 'react'

function subscribe(onChange: () => void) {
  document.addEventListener('fullscreenchange', onChange)
  return () => document.removeEventListener('fullscreenchange', onChange)
}

// 全画面かどうかはReactの外（ブラウザ）が持つ状態なので、useEffect+useStateで写し取らず
// useSyncExternalStoreで直接購読する。サーバ側では常にfalse扱い。
export function FullscreenToggleButton() {
  const isFullscreen = useSyncExternalStore(
    subscribe,
    () => document.fullscreenElement !== null,
    () => false,
  )

  const toggle = () => {
    if (document.fullscreenElement) {
      void document.exitFullscreen()
    } else {
      void document.documentElement.requestFullscreen()
    }
  }

  return (
    <button
      type="button"
      onClick={toggle}
      className="flex min-h-16 w-full items-center rounded-lg bg-black/5 px-4 text-xl hover:bg-black/10 dark:bg-white/10 dark:hover:bg-white/20"
    >
      {isFullscreen ? '全画面を解除' : '全画面'}
    </button>
  )
}
