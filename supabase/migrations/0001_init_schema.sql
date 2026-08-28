create extension if not exists "pgcrypto";

create table staff (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  department text not null check (department in ('土木', '運輸')),
  normal_vehicle_id uuid,
  display_order integer not null default 0,
  active boolean not null default true,
  retired_at timestamptz,
  created_at timestamptz not null default now()
);

create table vehicles (
  id uuid primary key default gen_random_uuid(),
  display_name text not null,
  vehicle_number text not null,
  vehicle_type text not null,
  status text not null default '使用可能' check (status in ('使用可能', '整備', '車検', '故障', '使用停止')),
  display_order integer not null default 0,
  active boolean not null default true,
  created_at timestamptz not null default now()
);

alter table staff
  add constraint staff_normal_vehicle_id_fkey
  foreign key (normal_vehicle_id) references vehicles(id);

create table sites (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  category text not null check (category in ('土木', '運輸', '共通')),
  active boolean not null default true,
  display_order integer not null default 0,
  usage_count integer not null default 0,
  created_at timestamptz not null default now()
);

create table placement_slots (
  id uuid primary key default gen_random_uuid(),
  site_id uuid not null references sites(id),
  opened_at timestamptz not null default now(),
  ended_at timestamptz
);

create table staff_placements (
  staff_id uuid primary key references staff(id),
  slot_id uuid references placement_slots(id),
  assigned_vehicle_id uuid references vehicles(id),
  updated_at timestamptz not null default now()
);

create table vehicle_placements (
  vehicle_id uuid primary key references vehicles(id),
  slot_id uuid references placement_slots(id),
  updated_at timestamptz not null default now()
);

create table attendance_events (
  id uuid primary key default gen_random_uuid(),
  staff_id uuid not null references staff(id),
  action text not null check (action in ('clockIn', 'clockOut')),
  occurred_at timestamptz not null,
  created_at timestamptz not null default now()
);
