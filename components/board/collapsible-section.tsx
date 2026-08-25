'use client'

import { useEffect, useRef, useState, type ReactNode } from 'react'
import { useCollapsibleBoardSignal } from './collapsible-board'

export function CollapsibleSection({ title, children }: { title: string; children: ReactNode }) {
  const { openSignal, closeSignal } = useCollapsibleBoardSignal()
  const [isOpen, setIsOpen] = useState(true)
  // 初回マウント時の実行を無視するため、直前の値を覚えておいて「変化したときだけ」反応する。
  // （真偽値の「実行済みフラグ」だとReact Strict Modeのeffect二重実行で初回から
  // 反応してしまい、マウント直後に閉じた状態になるバグがあったため、値比較に変更した）
  const prevOpenSignal = useRef(openSignal)
  const prevCloseSignal = useRef(closeSignal)

  useEffect(() => {
    if (openSignal !== prevOpenSignal.current) {
      prevOpenSignal.current = openSignal
      setIsOpen(true)
    }
  }, [openSignal])

  useEffect(() => {
    if (closeSignal !== prevCloseSignal.current) {
      prevCloseSignal.current = closeSignal
      setIsOpen(false)
    }
  }, [closeSignal])

  return (
    <section>
      <button
        type="button"
        className="w-full text-left font-bold"
        onClick={() => setIsOpen((prev) => !prev)}
      >
        {isOpen ? '▼' : '▶'} {title}
      </button>
      {isOpen ? <div>{children}</div> : null}
    </section>
  )
}
