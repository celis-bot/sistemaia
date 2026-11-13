-- ============================================================
--  Sistema IA - Esquema inicial (Supabase / Postgres)
--  Ejecutar en: Supabase Dashboard -> SQL Editor
-- ============================================================

-- ---------- Perfiles de usuario (complementa auth.users) ----------
create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  full_name text,
  role text not null default 'viewer' check (role in ('admin','docente','viewer')),
  created_at timestamptz not null default now()
);

-- ---------- Usuarios locales alternativos (bcrypt) ----------
create table if not exists public.app_users (
  id uuid primary key default gen_random_uuid(),
  email text unique not null,
  password_hash text not null,          -- bcrypt
  role text not null default 'viewer' check (role in ('admin','docente','viewer')),
  created_at timestamptz not null default now()
);

-- ---------- Corridas de importacion ----------
create table if not exists public.import_runs (
  id uuid primary key default gen_random_uuid(),
  source text not null default 'teams', -- 'teams' | 'conecta' | 'manual'
  file_name text,
  total_rows integer not null default 0,
  created_at timestamptz not null default now()
);

-- ---------- Entregas de tareas (desde Excel de Teams) ----------
create table if not exists public.task_deliveries (
  id uuid primary key default gen_random_uuid(),
  import_run_id uuid references public.import_runs(id) on delete set null,
  student_name text not null,
  total_tasks integer not null default 0,
  delivered_tasks integer not null default 0,
  on_time_tasks integer not null default 0,
  avg_grade numeric(5,2),
  tasks_score numeric(5,4) not null default 0,
  punctuality_score numeric(5,4) not null default 0,
  created_at timestamptz not null default now()
);
create index if not exists idx_task_deliveries_student on public.task_deliveries(student_name);

-- ---------- Inasistencias (desde Conecta UACJ) ----------
create table if not exists public.attendance_records (
  id uuid primary key default gen_random_uuid(),
  student_id text,
  period text,
  fecha date,
  materia text,
  estado text,
  justificacion text,
  raw jsonb,
  created_at timestamptz not null default now(),
  unique (student_id, fecha, materia)
);
create index if not exists idx_attendance_student on public.attendance_records(student_id);

-- ---------- Ponderacion de desempeno ----------
create table if not exists public.student_performance (
  id uuid primary key default gen_random_uuid(),
  period text not null default 'default',
  student_name text not null,
  student_id text,
  tasks_score numeric(5,4),
  attendance_score numeric(5,4),
  absences integer not null default 0,
  score numeric(5,4) not null default 0,   -- ponderacion final 0..1
  grade text,                              -- A B C D F
  created_at timestamptz not null default now(),
  unique (period, student_name)
);
create index if not exists idx_performance_score on public.student_performance(score desc);

-- ---------- Trigger: crear perfil al registrarse ----------
create or replace function public.handle_new_user()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  insert into public.profiles (id, full_name)
  values (new.id, new.raw_user_meta_data->>'full_name');
  return new;
end $$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- ---------- Row Level Security ----------
alter table public.profiles enable row level security;
alter table public.app_users enable row level security;
alter table public.import_runs enable row level security;
alter table public.task_deliveries enable row level security;
alter table public.attendance_records enable row level security;
alter table public.student_performance enable row level security;

-- Helper para rol (debe crearse antes de las policies que lo usan)
create or replace function public.role()
returns text language sql stable security definer set search_path = public as $$
  select coalesce(
    (select role from public.profiles where id = auth.uid()),
    'viewer'
  );
$$;

-- Perfiles: el usuario lee/edita el suyo; admin lee todos
drop policy if exists "profiles_select_own" on public.profiles;
create policy "profiles_select_own" on public.profiles
  for select using (auth.uid() = id or public.role() = 'admin');
drop policy if exists "profiles_update_own" on public.profiles;
create policy "profiles_update_own" on public.profiles
  for update using (auth.uid() = id);

-- Tablas operativas: solo lectura para usuarios autenticados;
-- escritura solo via backend (service role bypasea RLS).
drop policy if exists "import_runs_read" on public.import_runs;
create policy "import_runs_read" on public.import_runs
  for select to authenticated using (true);
drop policy if exists "task_deliveries_read" on public.task_deliveries;
create policy "task_deliveries_read" on public.task_deliveries
  for select to authenticated using (true);
drop policy if exists "attendance_read" on public.attendance_records;
create policy "attendance_read" on public.attendance_records
  for select to authenticated using (true);
drop policy if exists "performance_read" on public.student_performance;
create policy "performance_read" on public.student_performance
  for select to authenticated using (true);

-- app_users NUNCA accesible desde el cliente
drop policy if exists "app_users_deny" on public.app_users;
create policy "app_users_deny" on public.app_users
  for all to authenticated using (false) with check (false);
