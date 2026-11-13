import { Router } from 'express';
import { z } from 'zod';
import { requireAuth, requireRole } from '../middleware/auth.js';
import { fetchAttendance } from '../services/conectaUACJ.js';
import { supabaseAdmin } from '../services/supabase.js';
import { validate } from '../middleware/validate.js';
// querySchema se aplica solo a req.query (GET)
import { cacheGet, cacheSet, cacheKey } from '../lib/cache.js';

const router = Router();
router.use(requireAuth, requireRole('admin', 'docente'));

const querySchema = z.object({
  student_id: z.string().optional(),
  period: z.string().optional(),
  persist: z.coerce.boolean().default(false),
});

// Consulta inasistencias en Conecta UACJ
router.get('/', validate({ query: querySchema }), async (req, res, next) => {
  try {
    const { student_id, period } = req.query;
    const key = cacheKey('conecta', student_id || 'all', period || '');
    const cached = cacheGet(key, 10 * 60 * 1000);
    if (cached) return res.json(cached);

    const result = await fetchAttendance({ studentId: student_id, period });
    cacheSet(key, result, 10 * 60 * 1000);

    if (req.query.persist) {
      const rows = result.records.map((r) => ({
        student_id: student_id || null,
        period: period || null,
        fecha: r.fecha,
        materia: r.materia,
        estado: r.estado,
        justificacion: r.justificacion,
        raw: r.raw,
      }));
      if (rows.length) {
        await supabaseAdmin.from('attendance_records').upsert(rows, { onConflict: 'student_id,fecha,materia' });
      }
    }

    res.json(result);
  } catch (e) { next(e); }
});

export default router;
