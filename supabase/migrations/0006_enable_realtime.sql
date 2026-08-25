-- 盤面のRealtime自動同期(RealtimeBoardWatcher)が購読する7テーブルを
-- supabase_realtime publicationに追加する。ダッシュボードでの手動設定は
-- 再現不可能でgit管理外になるため、マイグレーションとして管理する。
-- 冪等にするため、既にpublicationに含まれるテーブルはスキップする。

do $$
declare
  target_table text;
begin
  foreach target_table in array array['staff', 'vehicles', 'sites', 'placement_slots', 'staff_placements', 'vehicle_placements', 'attendance_events']
  loop
    if not exists (
      select 1 from pg_publication_tables
      where pubname = 'supabase_realtime' and tablename = target_table
    ) then
      execute format('alter publication supabase_realtime add table %I', target_table);
    end if;
  end loop;
end $$;
