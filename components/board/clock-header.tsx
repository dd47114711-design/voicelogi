'use client'

import { useEffect, useState } from 'react'

function formatClock(date: Date): { time: string; dateLabel: string } {
  const time = date.toLocaleTimeString('ja-JP', { hour12: false })
  const dateLabel = date.toLocaleDateString('ja-JP', {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
    weekday: 'short',
  })
  return { time, dateLabel }
}

export function ClockHeader() {
  const [now, setNow] = useState<Date | null>(null)

  useEffect(() => {
    setNow(new Date())
    const timer = setInterval(() => setNow(new Date()), 1000)
    return () => clearInterval(timer)
  }, [])

  if (!now) {
    return null
  }

  const { time, dateLabel } = formatClock(now)

  return (
    <header className="flex flex-col items-center py-4">
      <p className="font-mono text-5xl tabular-nums">{time}</p>
      <p className="text-lg">{dateLabel}</p>
    </header>
  )
}
