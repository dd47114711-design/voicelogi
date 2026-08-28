import { getUnassignedStaff } from '@/lib/queries/unassigned-staff'
import { CollapsibleSection } from './collapsible-section'
import { NameTag } from '@/components/ui/name-tag'
import { SiteTag } from '@/components/ui/site-tag'

export async function UnassignedStaffGroup({ department }: { department: '土木' | '運輸' }) {
  const members = await getUnassignedStaff(department, 'present')
  if (members.length === 0) {
    return null
  }

  return (
    <CollapsibleSection title={`現場未定（${members.length}人）`}>
      <div className="flex flex-wrap items-start gap-4">
        <div className="flex flex-wrap gap-2">
          {members.map((member) => (
            <NameTag key={member.staffId} name={member.name} status="present" />
          ))}
        </div>
        <SiteTag name="現場未定" />
      </div>
    </CollapsibleSection>
  )
}
