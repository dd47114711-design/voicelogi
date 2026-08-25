import { getStaffCount } from '@/app/actions/staff'

export async function StaffCount() {
  const count = await getStaffCount()
  return <p className="text-lg">staffテーブルの件数: {count}</p>
}
