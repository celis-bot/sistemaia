import { Router } from 'express';
import { requireAuth } from '../middleware/auth.js';
import { supabaseAdmin } from '../services/supabase.js';
import { badRequest } from '../lib/errors.js';

const router = Router();
router.use(requireAuth);

// Endpoint de analiticas pensado para la futura app movil.
// Devuelve un resumen por estudiante listo para graficar en pantalla.
router.get('/analytics/:studentId', async (req, res, next) => {
  try {
    const { studentId } = req.params;
    const key = studentId.toLowerCase();

    const [{ data: perf }, { data: deliveries }] = await Promise.all([
      supabaseAdmin.from('student_performance').select('*').ilike('student_name', `%${studentId}%`),
      supabaseAdmin.from('task_deliveries').select('*').ilike('student_name', `%${studentId}%`).limit(100),
    ]);

    if (perf.error) throw badRequest(perf.error.message);

    const rows = perf.data ?? [];
    const p = rows[0] ?? null;
    const delRows = deliveries.data ?? [];
    const totalDeliveries = delRows.reduce((s, d) => s + (d.total_tasks || 0), 0);
    const totalDone = delRows.reduce((s, d) => s + (d.delivered_tasks || 0), 0);

    res.json({
      student: studentId,
      performance: p ?? null,
      summary: {
        tasks_completion: totalDeliveries ? totalDone / totalDeliveries : 0,
        deliveries_count: delRows.length,
      },
      // Estructura pensada para la app movil (graficos):
      charts: {
        performance_gauge: p?.score ?? 0,
        attendance_line: [], // se llenara cuando la app movil consuma attendance_records
        tasks_bar: delRows.map((d) => ({
          name: d.student_name,
          delivered: d.delivered_tasks,
          total: d.total_tasks,
        })) ?? [],
      },
    });
  } catch (e) { next(e); }
});

// Listado general para el dashboard de la app
router.get('/dashboard', async (_req, res, next) => {
  try {
    const [{ data: perf, error: pErr }, { count: imports }] = await Promise.all([
      supabaseAdmin.from('student_performance').select('student_name,score,grade').order('score', { ascending: false }).limit(50),
      supabaseAdmin.from('import_runs').select('*', { count: 'exact', head: true }),
    ]);
    if (pErr) throw badRequest(pErr.message);
    res.json({ top_students: perf ?? [], total_imports: imports ?? 0 });
  } catch (e) { next(e); }
});

export default router;
