# App movil (pendiente)

Esta carpeta estara destinada a la aplicacion movil (se recomienda **Expo + React Native**)
que consumira los endpoints `/api/mobile/*` del backend.

## Endpoints ya disponibles para la app

- `GET /api/mobile/dashboard` — resumen general (top estudiantes, total importaciones)
- `GET /api/mobile/analytics/:studentId` — analiticas por estudiante:
  - `performance.score` / `grade` (ponderacion)
  - `charts.performance_gauge` — valor para grafica de desempeno
  - `charts.attendance_line` — serie de inasistencias (se llenara al persistir Conecta)
  - `charts.tasks_bar` — barras de entregas vs total por estudiante

## Autenticacion

Usar el mismo JWT de Supabase Auth (`supabase.auth.signInWithPassword`)
y enviarlo como `Authorization: Bearer <token>`.

## Estructura sugerida

```
apps/mobile/
  app.json
  package.json
  src/
    api/client.ts      # fetch con JWT
    screens/Dashboard.tsx
    screens/StudentAnalytics.tsx  # pantalla de analiticas por estudiante
    components/Charts.tsx         # graficos (victory-native / react-native-chart-kit)
```
