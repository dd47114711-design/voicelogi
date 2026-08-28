import { getOfficeStaff } from '@/lib/queries/office-staff'
import { NameTag } from '@/components/ui/name-tag'

/**
 * 事務部門の盤面。
 * legacy(webapp/app.js:1176)と同じく、現場・ダンプを持たない氏名+出退勤だけの一覧。
 * 事務員はどの配置枠にも入らないため、「休み」グループは作らない。
 * 休みは「どの配置枠にも居ない人」の概念であり、配置枠を持たない事務には
 * そもそも当てはまらないため。
 */
export async function OfficeBoard() {
  const members = await getOfficeStaff()

  return (
    <section className="flex flex-col gap-4">
      <h2 className="text-2xl font-bold">事務部門</h2>
      {members.length === 0 ? (
        <p className="text-lg">事務員が登録されていません。</p>
      ) : (
        <div className="flex flex-wrap gap-2">
          {members.map((member) => (
            <NameTag key={member.staffId} name={member.name} status={member.status} />
          ))}
        </div>
      )}
    </section>
  )
}
