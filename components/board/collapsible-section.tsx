'use client'

import { useEffect, useRef, useState, type ReactNode } from 'react'
import { useCollapsibleBoardSignal } from './collapsible-board'

export function CollapsibleSection({ title, children }: { title: string; children: ReactNode }) {
  const { openSignal, closeSignal } = useCollapsibleBoardSignal()
  const [isOpen, setIsOpen] = useState(true)
  const openMounted = useRef(false)
  const closeMounted = useRef(false)

  useEffect(() => {
    if (!openMounted.current) {
      openMounted.current = true
      return
    }
    setIsOpen(true)
  }, [openSignal])

  useEffect(() => {
    if (!closeMounted.current) {
      closeMounted.current = true
      return
    }
    setIsOpen(false)
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
