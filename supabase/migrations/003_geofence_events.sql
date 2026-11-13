-- ============================================================
--  Sistema IA - Eventos de geocercas (entradas/salidas)
--  Ejecutar en: Supabase Dashboard -> SQL Editor
-- ============================================================

-- Log de eventos enter/exit por sujeto y geocerca
create table if not exists public.geofence_events (
  id uuid primary key default gen_random_uuid(),
  geofence_id uuid not null references public.geofences(id) on delete cascade,
  subject_id text not null,             -- id de la persona/dispositivo que reporta
  event text not null check (event in ('enter','exit')),
  lat double precision not null,
  lng double precision not null,
  accuracy_m double precision,
  source text,                          -- 'mobile' | 'web' | etc
  created_at timestamptz not null default now()
);
create index if not exists idx_geofence_events_geo on public.geofence_events(geofence_id, created_at desc);
create index if not exists idx_geofence_events_subject on public.geofence_events(subject_id, created_at desc);

-- Estado actual de presencia (quien esta dentro/fuera ahora)
create table if not exists public.geofence_presence (
  subject_id text not null,
  geofence_id uuid not null references public.geofences(id) on delete cascade,
  inside boolean not null default false,
  last_lat double precision,
  last_lng double precision,
  last_seen_at timestamptz not null default now(),
  primary key (subject_id, geofence_id)
);
create index if not exists idx_presence_inside on public.geofence_presence(geofence_id) where inside;

-- ---------- Row Level Security ----------
alter table public.geofence_events enable row level security;
alter table public.geofence_presence enable row level security;

-- Lectura para usuarios autenticados; escritura solo via backend (service role)
drop policy if exists "geofence_events_read" on public.geofence_events;
create policy "geofence_events_read" on public.geofence_events
  for select to authenticated using (true);
drop policy if exists "geofence_presence_read" on public.geofence_presence;
create policy "geofence_presence_read" on public.geofence_presence
  for select to authenticated using (true);
