-- placement_slots に部門を追加する。
-- 「共通」区分の現場は土木配置枠・運輸配置枠が同時に別々に存在しうるため、
-- site.category だけでは配置枠の表示先部門を判定できない。配置枠自身に
-- 部門を持たせる（legacyのdispatchGroups.departmentに相当）。

alter table placement_slots
  add column department text not null check (department in ('土木', '運輸'));

create index placement_slots_department_idx on placement_slots (department);
