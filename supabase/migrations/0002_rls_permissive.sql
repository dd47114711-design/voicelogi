alter table staff enable row level security;
alter table vehicles enable row level security;
alter table sites enable row level security;
alter table placement_slots enable row level security;
alter table staff_placements enable row level security;
alter table vehicle_placements enable row level security;
alter table attendance_events enable row level security;

create policy "staff_select_all" on staff for select using (true);
create policy "staff_insert_all" on staff for insert with check (true);
create policy "staff_update_all" on staff for update using (true) with check (true);

create policy "vehicles_select_all" on vehicles for select using (true);
create policy "vehicles_insert_all" on vehicles for insert with check (true);
create policy "vehicles_update_all" on vehicles for update using (true) with check (true);

create policy "sites_select_all" on sites for select using (true);
create policy "sites_insert_all" on sites for insert with check (true);
create policy "sites_update_all" on sites for update using (true) with check (true);

create policy "placement_slots_select_all" on placement_slots for select using (true);
create policy "placement_slots_insert_all" on placement_slots for insert with check (true);
create policy "placement_slots_update_all" on placement_slots for update using (true) with check (true);

create policy "staff_placements_select_all" on staff_placements for select using (true);
create policy "staff_placements_insert_all" on staff_placements for insert with check (true);
create policy "staff_placements_update_all" on staff_placements for update using (true) with check (true);

create policy "vehicle_placements_select_all" on vehicle_placements for select using (true);
create policy "vehicle_placements_insert_all" on vehicle_placements for insert with check (true);
create policy "vehicle_placements_update_all" on vehicle_placements for update using (true) with check (true);

create policy "attendance_events_select_all" on attendance_events for select using (true);
create policy "attendance_events_insert_all" on attendance_events for insert with check (true);
