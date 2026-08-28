import { getUnassignedStaff } from '@/lib/queries/unassigned-staff'
import { CollapsibleSection } from './collapsible-section'
import { NameTag } from '@/components/ui/name-tag'
import { SiteTag } from '@/components/ui/site-tag'

export async function RestingStaffGroup({ department }: { department: '土木' | '運輸' }) {
  const members = await getUnassignedStaff(department, 'absent')
  if (members.length === 0) {
    return null
  }

  return (
    <CollapsibleSection title={`休み（${members.length}人）`}>
      <div className="flex flex-wrap items-start gap-4">
        <div className="flex flex-wrap gap-2">
          {members.map((member) => (
            <NameTag key={member.staffId} name={member.name} status="absent" />
          ))}
        </div>
        <SiteTag name="休み" />
      </div>
    </CollapsibleSection>
  )
}
