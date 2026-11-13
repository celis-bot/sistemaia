# Sistema IA

Monorepo para administracion academica:

- **Teams (Microsoft 365)** → descarga reportes Excel de entregas de tareas
- **Conecta UACJ** → consulta de inasistencias
- **Ponderacion** → score de desempeno por estudiante (tareas + asistencia + puntualidad)
- **App movil** (futura) → pantalla de analiticas por estudiante

## Estructura

```
apps/
  web/      SvelteKit (frontend) — Vercel
  api/      Node.js + Express (backend) — Vercel / VPS
  mobile/   (pendiente) app movil Expo/React Native
supabase/   Migraciones SQL
infra/      nginx.conf (balanceador de cargas)
.env.example
```

## Stack

| Capa        | Tecnologia                                    |
|-------------|-----------------------------------------------|
| Frontend    | SvelteKit 2 + Svelte 5 + adapter-vercel       |
| Backend     | Node.js 20+ / Express / ESM                   |
| Base datos  | Supabase (Postgres + Auth + RLS)              |
| Excel       | ExcelJS                                       |
| Microsoft   | @azure/msal-node + Microsoft Graph            |
| Conecta     | Playwright (scraping)                         |
| Mapas       | Leaflet 1.9 + Leaflet-Geoman (geocercas)      |
| Seguridad   | Helmet, CORS, rate-limit, bcrypt (opcional), RLS |
| Balanceo    | Node cluster + nginx (self-hosted); Vercel en la nube |

## Inicio rapido

```bash
cp .env.example .env          # llenar credenciales
npm install

# 1. Aplicar supabase/migrations/001_init.sql, 002_geofences.sql y
#    003_geofence_events.sql en el SQL Editor de Supabase
# 2. Sembrar admin (opcional, si LOCAL_AUTH_ENABLED=true):
npm run seed

# 3. Desarrollo
npm run dev                   # web en :5173 + api en :4000
```

Frontend `.env` (apps/web/.env):
```
PUBLIC_API_URL=http://localhost:4000
PUBLIC_SUPABASE_URL=...
PUBLIC_SUPABASE_ANON_KEY=...
```

## Seguridad

- **Contrasenas**: Supabase Auth las hashea/encripta internamente.
  Ademas hay modo alternativo `LOCAL_AUTH_ENABLED=true` que guarda hashes
  **bcrypt** (`BCRYPT_ROUNDS=12`) en `app_users` — nunca texto plano.
- **Secretos**: todo lo sensible vive en `.env` (nunca commiteado, ver `.gitignore`).
- **Rate limiting**: `express-rate-limit` global + limite estricto en `/auth`.
- **RLS**: todas las tablas tienen Row Level Security; escritura solo via backend (service role).
- **Headers**: Helmet + CORS con whitelist (`CORS_ORIGIN`).

## Balanceador de cargas

Dos niveles implementados:

1. **Node cluster** (`npm run start:cluster`): `src/cluster.js` levanta N workers
   (`CLUSTER_WORKERS`, por defecto = CPUs) y el master redistribuye conexiones.
2. **nginx** (`infra/nginx.conf`): balanceo `least_conn` entre instancias,
   health checks en `/api/health`, reintentos automaticos.

En **Vercel** el balanceo es automatico (serverless); `apps/api/api/index.js`
expone la app Express como funcion.

## Endpoints principales

| Metodo | Ruta                                    | Descripcion                          |
|--------|-----------------------------------------|--------------------------------------|
| POST   | /api/auth/signup                        | Registro (Supabase Auth)             |
| POST   | /api/auth/login                         | Login                                |
| GET    | /api/teams/attachments                  | Lista Excels en canales de Teams     |
| POST   | /api/teams/import/:fileName             | Importa Excel -> task_deliveries     |
| GET    | /api/attendance                         | Consulta inasistencias Conecta UACJ  |
| GET    | /api/analytics/performance              | Ponderaciones calculadas             |
| POST   | /api/analytics/performance/recalculate  | Recalcular scores                    |
| GET    | /api/mobile/analytics/:studentId        | Analiticas por estudiante (movil)    |
| GET    | /api/mobile/dashboard                   | Resumen general (movil)              |
| GET    | /api/geofences                          | Lista geocercas                      |
| POST   | /api/geofences                          | Crea geocerca (GeoJSON)              |
| GET    | /api/geofences/:id                      | Obtiene una geocerca                 |
| PATCH  | /api/geofences/:id                      | Actualiza geocerca                   |
| DELETE | /api/geofences/:id                      | Elimina geocerca                     |
| POST   | /api/geofences/ping                     | Ping de ubicacion -> enter/exit      |
| GET    | /api/geofence-events                    | Lista eventos enter/exit             |
| GET    | /api/geofence-events/presence           | Quien esta dentro ahora              |
| GET    | /api/health                             | Health check                         |

## Notas de build en Windows

`npm run build -w @sistema/web` usa `@sveltejs/adapter-vercel`, que crea
symlinks al final del build. En Windows requiere **Modo Desarrollador**
(Configuracion > Sistema > Para desarrolladores) o ejecutar como admin.
En Vercel el build corre en Linux y no tiene este problema.
Para desarrollo local usa `npm run dev` (Vite), que no necesita symlinks.

## Pendiente / por configurar

- `MS_*` y `TEAMS_TEAM_ID`: app registration en Azure con permisos de Graph.
- `CONECTA_*`: credenciales y selectores CSS reales del portal UACJ.
- Formato exacto del Excel de Teams (el parser detecta columnas por nombre;
  ajustar `NAME_KEYS`/`STATUS_KEYS` en `src/services/excelParser.js` si difiere).
- App movil: ver `apps/mobile/README.md`.
