-- ============================================================
--  Sistema IA - Geocercas (Leaflet / GeoJSON)
--  Ejecutar en: Supabase Dashboard -> SQL Editor
-- ============================================================

create table if not exists public.geofences (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  description text,
  kind text not null default 'polygon'
    check (kind in ('polygon','circle','rectangle','marker','polyline')),
  geojson jsonb not null,             -- Feature GeoJSON completo
  color text,                         -- color de render en el mapa
  created_by uuid,                        -- auth.users.id o app_users.id (sin FK: ambos modos de auth)
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists idx_geofences_kind on public.geofences(kind);

-- updated_at automatico
create or replace function public.touch_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end $$;

drop trigger if exists geofences_touch on public.geofences;
create trigger geofences_touch
  before update on public.geofences
  for each row execute function public.touch_updated_at();

-- ---------- Row Level Security ----------
alter table public.geofences enable row level security;

-- Lectura para cualquier usuario autenticado; escritura solo via backend (service role)
drop policy if exists "geofences_read" on public.geofences;
create policy "geofences_read" on public.geofences
  for select to authenticated using (true);
