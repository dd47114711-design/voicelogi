import { getStaffCount } from '@/lib/queries/staff'

export async function StaffCount() {
  const count = await getStaffCount()
  return <p className="text-lg">staffテーブルの件数: {count}</p>
}
