-- 配置データの整合性を守るための制約・索引・トリガーを追加する。
-- 追加のみ（DROP は行わない）。

-- ---------------------------------------------------------------------------
-- 1台のダンプに2人が同時に乗ることを DB レベルで禁止する。
-- ドメイン不変条件「1人・1台が同時に2つの配置枠に入らない」の車両側の担保。
-- assigned_vehicle_id が null（ダンプに乗っていない）の行は対象外なので部分索引にする。
-- ---------------------------------------------------------------------------
create unique index staff_placements_assigned_vehicle_uniq
  on staff_placements (assigned_vehicle_id)
  where assigned_vehicle_id is not null;

-- ---------------------------------------------------------------------------
-- 外部キー列の索引。Postgres は外部キーに索引を自動作成しないため明示的に張る。
-- 参照元の削除・更新時のロック範囲を抑え、盤面の絞り込みクエリを速くする。
-- ---------------------------------------------------------------------------
create index placement_slots_site_id_idx on placement_slots (site_id);
create index staff_placements_slot_id_idx on staff_placements (slot_id);
create index vehicle_placements_slot_id_idx on vehicle_placements (slot_id);

-- 出退勤の集計は「ある従業員の、ある期間のイベント」を時系列で読む。複合索引にする。
create index attendance_events_staff_id_occurred_at_idx
  on attendance_events (staff_id, occurred_at);

-- ---------------------------------------------------------------------------
-- updated_at を UPDATE のたびに自動更新する。
-- default now() は INSERT 時にしか効かないため、トリガーで補う。
-- ---------------------------------------------------------------------------
create or replace function set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create trigger staff_placements_set_updated_at
  before update on staff_placements
  for each row execute function set_updated_at();

create trigger vehicle_placements_set_updated_at
  before update on vehicle_placements
  for each row execute function set_updated_at();

-- ---------------------------------------------------------------------------
-- 配置の正解がどちらのテーブルにあるかを明示する（旧実装の todaySiteId の挙動を継承）。
-- ---------------------------------------------------------------------------
comment on table staff_placements is
  '従業員の現在の配置。staff_id ごとに1行。assigned_vehicle_id はその日に乗っているダンプ（通常ダンプとは別データ）。'
  ' assigned_vehicle_id が設定されている間は、そのダンプがどこに居るかの正解はこのテーブルの slot_id である。'
  ' vehicle_placements.slot_id は参照しない。';

comment on table vehicle_placements is
  '運転手が乗っていないダンプの駐車場所。vehicle_id ごとに1行。'
  ' slot_id が意味を持つのは、その車両を staff_placements.assigned_vehicle_id として参照している行が無いとき（＝無人で現場に置かれているとき）だけ。'
  ' 運転手が乗り込んだ時点で配置の正解は staff_placements 側へ移る（旧実装で vehicle.todaySiteId が null に戻っていたのと同じ扱い）。';

comment on column staff_placements.assigned_vehicle_id is
  '当日の乗車ダンプ。staff.normal_vehicle_id（通常ダンプ）とは別データで、当日だけ別車両に乗っても通常ダンプ設定は変わらない。'
  ' 部分一意索引により、同時に2人が同じ車両を指すことはできない。';
