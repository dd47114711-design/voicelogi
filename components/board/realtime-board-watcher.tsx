'use client'

import { useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@supabase/supabase-js'
import type { Database } from '@/lib/supabase/database.types'

const WATCHED_TABLES = [
  'staff',
  'vehicles',
  'sites',
  'placement_slots',
  'staff_placements',
  'vehicle_placements',
  'attendance_events',
] as const

export function RealtimeBoardWatcher() {
  const router = useRouter()

  useEffect(() => {
    const supabase = createClient<Database>(
      process.env.NEXT_PUBLIC_SUPABASE_URL as string,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY as string,
    )

    const channel = supabase.channel('board-realtime')
    for (const table of WATCHED_TABLES) {
      channel.on(
        'postgres_changes',
        { event: '*', schema: 'public', table },
        () => {
          router.refresh()
        },
      )
    }
    channel.subscribe()

    return () => {
      supabase.removeChannel(channel)
    }
  }, [router])

  return null
}
