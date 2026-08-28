/**
 * 現場・配置枠を持つ部門。placement_slots.department に入りうるのはこの2つだけ。
 * 事務員は現場にもダンプにも紐づかないため、ここには含めない。
 */
export type BoardDepartment = '土木' | '運輸'

/** 従業員の所属部門。staff.department に入る値。 */
export type StaffDepartment = BoardDepartment | '事務'

/** URLの ?dept= に載せるキー。日本語をクエリに入れずに済ませるためのASCII表現。 */
export type TabKey = 'doboku' | 'unyu' | 'office' | 'summary'

export const TAB_KEYS = ['doboku', 'unyu', 'office', 'summary'] as const satisfies readonly TabKey[]

const DEPARTMENT_BY_TAB: Record<TabKey, StaffDepartment | null> = {
  doboku: '土木',
  unyu: '運輸',
  office: '事務',
  summary: null,
}

const LABEL_BY_TAB: Record<TabKey, string> = {
  doboku: '土木',
  unyu: '運輸',
  office: '事務',
  summary: '全体確認',
}

function isTabKey(value: string): value is TabKey {
  return (TAB_KEYS as readonly string[]).includes(value)
}

/**
 * searchParams から来た生の値をタブキーに正規化する。
 * 未指定・未知の値は土木にフォールバックし、404にはしない。
 * 現場のタッチモニターでURLが壊れても盤面が出なくならないようにするため。
 */
export function resolveTabKey(raw: string | string[] | undefined): TabKey {
  const value = Array.isArray(raw) ? raw[0] : raw
  if (value !== undefined && isTabKey(value)) {
    return value
  }
  return 'doboku'
}

/** タブに対応する所属部門。全体確認は特定の部門を持たないので null。 */
export function departmentOfTab(tab: TabKey): StaffDepartment | null {
  return DEPARTMENT_BY_TAB[tab]
}

export function tabLabel(tab: TabKey): string {
  return LABEL_BY_TAB[tab]
}
