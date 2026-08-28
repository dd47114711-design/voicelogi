import { Suspense } from 'react'
import { getSiteGroupList } from '@/lib/queries/site-groups'
import { SiteGroupCard } from './site-group-card'

export async function SiteGroupList({ department }: { department: '土木' | '運輸' }) {
  const groups = await getSiteGroupList(department)

  return (
    <>
      {groups.map((group) => (
        <Suspense key={group.slotId} fallback={<p>{group.label}を読み込み中...</p>}>
          <SiteGroupCard slotId={group.slotId} label={group.label} department={department} />
        </Suspense>
      ))}
    </>
  )
}
