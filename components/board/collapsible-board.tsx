'use client'

import { createContext, useContext, useState, type ReactNode } from 'react'

interface CollapsibleBoardContextValue {
  openSignal: number
  closeSignal: number
}

const CollapsibleBoardContext = createContext<CollapsibleBoardContextValue>({
  openSignal: 0,
  closeSignal: 0,
})

export function useCollapsibleBoardSignal(): CollapsibleBoardContextValue {
  return useContext(CollapsibleBoardContext)
}

export function CollapsibleBoard({ children }: { children: ReactNode }) {
  const [openSignal, setOpenSignal] = useState(0)
  const [closeSignal, setCloseSignal] = useState(0)

  return (
    <CollapsibleBoardContext.Provider value={{ openSignal, closeSignal }}>
      <div className="flex flex-col gap-2">
        <div className="flex justify-end gap-2">
          <button
            type="button"
            className="rounded bg-slate-200 px-3 py-1 text-sm"
            onClick={() => setOpenSignal((n) => n + 1)}
          >
            すべて開く
          </button>
          <button
            type="button"
            className="rounded bg-slate-200 px-3 py-1 text-sm"
            onClick={() => setCloseSignal((n) => n + 1)}
          >
            すべて閉じる
          </button>
        </div>
        {children}
      </div>
    </CollapsibleBoardContext.Provider>
  )
}
